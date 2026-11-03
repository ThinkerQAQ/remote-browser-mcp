package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"golang.org/x/term"
)

//go:embed ui/*
var assets embed.FS

var tunnelIDPattern = regexp.MustCompile(`^tunnel_[A-Za-z0-9_-]+$`)

type state struct {
	Revision        string `json:"revision"`
	RestartRequired bool   `json:"restart_required"`
	ID              string `json:"id"`
	HasKey          bool   `json:"has_key"`
	Managed         bool   `json:"managed_process_running"`
	Ready           bool   `json:"tunnel_ready"`
	Manager         string `json:"manager"`
	Autostart       *bool  `json:"autostart_enabled"`
	Error           string `json:"error,omitempty"`
}
type setupState struct {
	ID      string `json:"id"`
	Manager string `json:"manager"`
}
type runtimeState struct {
	Managed   bool   `json:"managed_process_running"`
	Ready     bool   `json:"tunnel_ready"`
	Manager   string `json:"manager"`
	Autostart *bool  `json:"autostart_enabled"`
}

func root() (string, error) {
	exe, e := os.Executable()
	if e != nil {
		return "", e
	}
	exe, e = filepath.EvalSymlinks(exe)
	if e != nil {
		return "", e
	}
	dir := filepath.Dir(exe)
	for _, p := range []string{dir, filepath.Dir(dir)} {
		if _, e := os.Stat(filepath.Join(p, "scripts", "launch.mjs")); e == nil {
			return p, nil
		}
	}
	return "", errors.New("cannot find bundled MCP runtime next to client")
}
func node(root string) string {
	name := "node"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	bundled := filepath.Join(root, "bin", name)
	if _, err := os.Stat(bundled); err == nil {
		return bundled
	}
	return name
}
func tunnel(root string) string {
	name := "tunnel-client"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return filepath.Join(root, "bin", name)
}
func runNode(root, script string, env []string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	argv := append([]string{filepath.Join(root, "scripts", script)}, args...)
	cmd := exec.CommandContext(ctx, node(root), argv...)
	hideWindow(cmd)
	cmd.Dir = root
	filtered := make([]string, 0, len(os.Environ())+len(env)+3)
	for _, v := range os.Environ() {
		k := strings.ToUpper(strings.SplitN(v, "=", 2)[0])
		if k == "RB_TUNNEL_ID" || k == "RB_RUNTIME_API_KEY" || k == "RB_TUNNEL_CLIENT" || k == "RB_TUNNEL_ARGS_JSON" || k == "OPENAI_API_KEY" || k == "RB_CONFIG" {
			continue
		}
		filtered = append(filtered, v)
	}
	filtered = append(filtered, "RB_TUNNEL_CLIENT="+tunnel(root), "PUPPETEER_SKIP_DOWNLOAD=true")
	filtered = append(filtered, env...)
	cmd.Env = filtered
	out, e := cmd.CombinedOutput()
	if ctx.Err() != nil {
		return nil, errors.New("runtime command timed out")
	}
	if e != nil {
		// Never include subprocess output: a nested runtime or dependency could echo a secret.
		return nil, fmt.Errorf("%s failed: %w", script, e)
	}
	return out, nil
}
func save(root, id, key string) error {
	return saveNative(root, id, key)
}
func readState(root string) state {
	return nativeState(root)
}
func service(root, action string) error {
	if action != "start" && action != "stop" && action != "restart" {
		return errors.New("invalid service action")
	}
	if action != "stop" {
		if err := validateSavedConnection(root); err != nil {
			return err
		}
	}
	if action == "restart" {
		if !nativeState(root).Managed {
			return errors.New("start the service before restarting it")
		}
		if err := controlNative(root, "stop"); err != nil {
			return err
		}
		deadline := time.Now().Add(10 * time.Second)
		for localControl(root, "status") {
			if time.Now().After(deadline) {
				return errors.New("service has not stopped; restart cancelled")
			}
			time.Sleep(100 * time.Millisecond)
		}
		return controlNative(root, "start")
	}
	return controlNative(root, action)
}
func sessionToken() string {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b)
}
func equalToken(a, b string) bool { return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1 }
func webGUI(root string) error {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	defer listener.Close()
	token := sessionToken()
	mux := http.NewServeMux()
	authorized := func(w http.ResponseWriter, r *http.Request) bool {
		cookie, e := r.Cookie("rb_session")
		if e != nil || !equalToken(cookie.Value, token) {
			http.Error(w, "Forbidden", 403)
			return false
		}
		return true
	}
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("session") == token {
			http.SetCookie(w, &http.Cookie{Name: "rb_session", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		if !authorized(w, r) {
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
		w.Header().Set("Cache-Control", "no-store")
		b, _ := assets.ReadFile("ui/index.html")
		_, _ = w.Write(b)
	})
	for _, file := range []string{"app.js", "state.js", "style.css"} {
		name := file
		mux.HandleFunc("GET /"+name, func(w http.ResponseWriter, r *http.Request) {
			if !authorized(w, r) {
				return
			}
			if strings.HasSuffix(name, "js") {
				w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
			} else {
				w.Header().Set("Content-Type", "text/css; charset=utf-8")
			}
			w.Header().Set("Cache-Control", "no-store")
			b, _ := assets.ReadFile("ui/" + name)
			_, _ = w.Write(b)
		})
	}
	mux.HandleFunc("GET /api/status", func(w http.ResponseWriter, r *http.Request) {
		if !authorized(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(readState(root))
	})
	var actionLock sync.Mutex
	mux.HandleFunc("POST /api/action", func(w http.ResponseWriter, r *http.Request) {
		if !authorized(w, r) {
			return
		}
		if r.Header.Get("X-RB-Session") != "1" || r.Header.Get("Origin") != "http://"+r.Host {
			http.Error(w, "Forbidden", 403)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
		defer r.Body.Close()
		var request struct {
			Action string `json:"action"`
			ID     string `json:"id"`
			Key    string `json:"key"`
		}
		if json.NewDecoder(r.Body).Decode(&request) != nil {
			http.Error(w, "Invalid request", 400)
			return
		}
		if !actionLock.TryLock() {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Another operation is in progress"})
			return
		}
		defer actionLock.Unlock()
		var e error
		switch request.Action {
		case "save":
			e = save(root, strings.TrimSpace(request.ID), request.Key)
		case "start", "stop", "restart":
			e = service(root, request.Action)
		default:
			e = errors.New("unknown action")
		}
		w.Header().Set("Content-Type", "application/json")
		if e != nil {
			w.WriteHeader(400)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": e.Error()})
			return
		}
		_ = json.NewEncoder(w).Encode(readState(root))
	})
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != listener.Addr().String() {
			http.Error(w, "Invalid host", 403)
			return
		}
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		mux.ServeHTTP(w, r)
	}), ReadHeaderTimeout: 5 * time.Second}
	address := "http://" + listener.Addr().String() + "/?session=" + token
	// A GUI is optional; in headless environments, use the CLI instead.
	if e := openBrowser(address); e != nil {
		return fmt.Errorf("could not open a browser; use the CLI for headless operation: %w", e)
	}
	return server.Serve(listener)
}
func openBrowser(url string) error {
	var c *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		c = exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", url)
	case "darwin":
		c = exec.Command("open", url)
	default:
		c = exec.Command("xdg-open", url)
	}
	return c.Start()
}
func main() {
	log.SetFlags(0)
	action := "gui"
	args := os.Args[1:]
	if len(args) > 0 {
		action = args[0]
		args = args[1:]
	}
	if strings.Contains(strings.ToLower(filepath.Base(os.Args[0])), "configure") {
		action = "gui"
	}
	root, e := root()
	if e != nil {
		if action == "--self-test" {
			fmt.Fprintln(os.Stderr, e)
			os.Exit(1)
		}
		log.Fatal(e)
	}
	switch action {
	case "--self-test":
		fmt.Println("CLIENT_SELF_TEST_PASS")
	case "serve-worker":
		if e = launchRuntime(root); e != nil {
			log.Fatal(e)
		}
	case "serve-service":
		if e = serveNative(root); e != nil {
			log.Fatal(e)
		}
	case "protect-path":
		if len(args) != 2 || (args[1] != "dir" && args[1] != "file") {
			log.Fatal("invalid permission helper")
		}
		if e = protectPrivate(args[0], args[1] == "dir"); e != nil {
			log.Fatal("could not restrict private permissions")
		}
	case "service":
		f := flag.NewFlagSet("service", flag.ExitOnError)
		scope := f.String("scope", "user", "user or system scope")
		account := f.String("user", "", "restricted service account")
		fromStdin := f.Bool("password-stdin", false, "Read Windows account password from stdin")
		_ = f.Parse(args)
		ops := f.Args()
		if len(ops) != 1 {
			log.Fatal("Use service install|uninstall|status")
		}
		switch ops[0] {
		case "install":
			password := ""
			if runtime.GOOS == "windows" {
				if *account == "" {
					log.Fatal("Windows service requires a restricted --user account")
				}
				if *fromStdin {
					b, err := io.ReadAll(io.LimitReader(os.Stdin, 4097))
					if err != nil {
						log.Fatal("Cannot read password")
					}
					password = strings.TrimRight(string(b), "\r\n")
				} else if term.IsTerminal(int(os.Stdin.Fd())) {
					fmt.Fprint(os.Stderr, "Service account password: ")
					b, err := term.ReadPassword(int(os.Stdin.Fd()))
					fmt.Fprintln(os.Stderr)
					if err != nil {
						log.Fatal("Cannot read hidden password")
					}
					password = string(b)
				} else {
					log.Fatal("Windows service password requires a TTY or --password-stdin")
				}
			}
			if e = installNativeService(root, *account, *scope, password); e != nil {
				log.Fatal(e)
			}
			fmt.Println("Native service installed")
		case "uninstall":
			if e = terminateNative(root); e != nil {
				log.Fatal(e)
			}
			fmt.Println("Native service uninstalled")
		case "status":
			_ = json.NewEncoder(os.Stdout).Encode(nativeState(root))
		default:
			log.Fatal("Use service install|uninstall|status")
		}
	case "gui":
		if e = webGUI(root); e != nil {
			log.Fatal(e)
		}
	case "status":
		b := readState(root)
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(b)
	case "start", "stop", "restart":
		if e = service(root, action); e != nil {
			log.Fatal(e)
		}
		fmt.Println(action + " succeeded")
	case "configure":
		f := flag.NewFlagSet("configure", flag.ExitOnError)
		id := f.String("id", "", "Tunnel ID")
		fromStdin := f.Bool("api-key-stdin", false, "Read runtime API key from standard input")
		_ = f.Parse(args)
		isTTY := term.IsTerminal(int(os.Stdin.Fd()))
		if !*fromStdin && !isTTY && (*id == "" || !readState(root).HasKey) {
			log.Fatal("non-interactive use requires --id and --api-key-stdin, unless an existing API key is saved")
		}
		if *id == "" {
			if !isTTY {
				log.Fatal("Tunnel ID is required; pass --id")
			}
			fmt.Fprint(os.Stderr, "Tunnel ID: ")
			line, err := bufio.NewReader(os.Stdin).ReadString('\n')
			if err != nil && err != io.EOF {
				log.Fatal("Unable to read Tunnel ID")
			}
			*id = strings.TrimSpace(line)
		}
		key := ""
		if *fromStdin {
			b, err := io.ReadAll(io.LimitReader(os.Stdin, 4097))
			if err != nil {
				log.Fatal("Cannot read API key")
			}
			key = strings.TrimRight(string(b), "\r\n")
		} else if isTTY {
			fmt.Fprint(os.Stderr, "Runtime API key (Enter keeps an existing key): ")
			b, err := term.ReadPassword(int(os.Stdin.Fd()))
			fmt.Fprintln(os.Stderr)
			if err != nil {
				log.Fatal("Unable to read hidden API key")
			}
			key = string(b)
		}
		if len(key) > 4096 {
			log.Fatal("API key too long")
		}
		if e = save(root, *id, key); e != nil {
			log.Fatal(e)
		}
		fmt.Println("Configuration saved; service state unchanged")
	default:
		fmt.Fprintln(os.Stderr, "Usage: remotebrowsermcp [gui|configure|start|stop|restart|status|service]")
		os.Exit(2)
	}
}
