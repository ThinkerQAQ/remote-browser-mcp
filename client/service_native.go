package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	kservice "github.com/kardianos/service"
)

type controlData struct {
	Port  int    `json:"port"`
	Token string `json:"token"`
}

func localControl(root, action string) bool {
	b, e := os.ReadFile(filepath.Join(root, "runtime", "control.json"))
	if e != nil {
		return false
	}
	var c controlData
	if json.Unmarshal(b, &c) != nil || c.Port < 1024 || c.Port > 65535 || len(c.Token) < 32 {
		return false
	}
	method := "GET"
	if action == "stop" {
		method = "POST"
	}
	req, e := http.NewRequest(method, fmt.Sprintf("http://127.0.0.1:%d/%s", c.Port, action), nil)
	if e != nil {
		return false
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	client := &http.Client{Timeout: 2 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, e := client.Do(req)
	if e != nil {
		return false
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return false
	}
	var result map[string]any
	return json.NewDecoder(response.Body).Decode(&result) == nil && fmt.Sprint(result["label"]) == "remote-browser-mcp-"+strings.TrimPrefix(serviceName(root), "RemoteBrowserMCP-")
}
func tunnelHealth(root string) bool {
	s, e := readSetup(root)
	if e != nil || s.Port < 1024 || s.Port > 65535 {
		return false
	}
	client := &http.Client{Timeout: 1500 * time.Millisecond}
	req, e := http.NewRequest("GET", fmt.Sprintf("http://127.0.0.1:%d/readyz", s.Port), nil)
	if e != nil {
		return false
	}
	r, e := client.Do(req)
	if e != nil {
		return false
	}
	r.Body.Close()
	return r.StatusCode == 200
}

func launchRuntime(root string) error {
	if !localControl(root, "status") {
		// Run only the Node MCP/Tunnel worker; service lifecycle belongs to Go.
		cmd := exec.Command(node(root), filepath.Join(root, "scripts", "runtime.mjs"), "run")
		hideWindow(cmd)
		cmd.Dir = root
		cmd.Env = append(os.Environ(), "PUPPETEER_SKIP_DOWNLOAD=true")
		execPath, _ := os.Executable()
		cmd.Env = append(cmd.Env, "RB_ACL_HELPER="+execPath)
		f, e := os.OpenFile(filepath.Join(root, "runtime", "tunnel.log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
		if e != nil {
			return e
		}
		if e = protectPrivate(f.Name(), false); e != nil {
			f.Close()
			return e
		}
		defer f.Close()
		cmd.Stdin = nil
		cmd.Stdout = f
		cmd.Stderr = f
		if e = cmd.Start(); e != nil {
			return e
		}
		err := cmd.Wait()
		if err != nil {
			return fmt.Errorf("tunnel worker exited: %w", err)
		}
	}
	return nil
}
func runDetached(root string) error {
	if localControl(root, "status") {
		return nil
	}
	executable, e := os.Executable()
	if e != nil {
		return e
	}
	command := exec.Command(executable, "serve-worker")
	command.Dir = root
	command.Env = append(os.Environ(), "PUPPETEER_SKIP_DOWNLOAD=true")
	// Detached worker retains its own log, never writes secrets to console.
	file, e := os.OpenFile(filepath.Join(root, "runtime", "tunnel.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if e != nil {
		return e
	}
	defer file.Close()
	command.Stdout = file
	command.Stderr = file
	configureDetached(command)
	if e = command.Start(); e != nil {
		return e
	}
	e = command.Process.Release()
	if e != nil {
		return e
	}
	for i := 0; i < 30; i++ {
		if localControl(root, "status") {
			return nil
		}
		time.Sleep(200 * time.Millisecond)
	}
	return errors.New("worker did not become ready; inspect local log")
}
func stopWorker(root string) error {
	if !localControl(root, "status") {
		return nil
	}
	if !localControl(root, "stop") {
		return errors.New("could not stop owned worker")
	}
	for i := 0; i < 30; i++ {
		if !localControl(root, "status") {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return errors.New("worker did not stop")
}

type daemon struct {
	root     string
	stopping chan struct{}
	done     chan struct{}
}

func (d *daemon) Start(s kservice.Service) error {
	// Keep a single OS-managed foreground process and retry transient child exits.
	d.stopping = make(chan struct{})
	d.done = make(chan struct{})
	go func() {
		defer close(d.done)
		for {
			select {
			case <-d.stopping:
				return
			default:
			}
			_ = launchRuntime(d.root)
			select {
			case <-d.stopping:
				return
			case <-time.After(5 * time.Second):
			}
		}
	}()
	return nil
}
func (d *daemon) Stop(s kservice.Service) error {
	// Handle Stop racing with startup, without ever signalling an unrelated PID.
	close(d.stopping)
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		_ = localControl(d.root, "stop")
		select {
		case <-d.done:
			return nil
		case <-time.After(100 * time.Millisecond):
		}
	}
	return errors.New("tunnel worker did not stop before deadline")
}

func serviceName(root string) string {
	digest := sha256.Sum256([]byte(root))
	return "RemoteBrowserMCP-" + hex.EncodeToString(digest[:5])
}
func daemonConfig(root, account, scope string) (*kservice.Config, error) {
	exe, e := os.Executable()
	if e != nil {
		return nil, e
	}
	config := &kservice.Config{
		Name:             serviceName(root),
		DisplayName:      "RemoteBrowserMCP",
		Description:      "Authorized local MCP Tunnel runtime",
		Executable:       exe,
		WorkingDirectory: root,
		Arguments:        []string{"serve-service"},
		UserName:         account,
		Option:           kservice.KeyValue{"KeepAlive": true, "RunAtLoad": true, "UserService": scope == "user"},
	}
	if runtime.GOOS == "windows" && scope == "user" {
		return nil, errors.New("Windows native user services require a system-service registration under a restricted user account")
	}
	if scope != "user" && scope != "system" {
		return nil, errors.New("scope must be user or system")
	}
	// Account validation occurs during install, not when inspecting the service.
	return config, nil
}
func nativeService(root, account, scope string) (kservice.Service, error) {
	cfg, e := daemonConfig(root, account, scope)
	if e != nil {
		return nil, e
	}
	return kservice.New(&daemon{root: root}, cfg)
}
func currentAccount() string {
	c, e := user.Current()
	if e != nil {
		return ""
	}
	if runtime.GOOS == "windows" {
		return c.Username
	}
	return c.Username
}
func installNativeService(root, account, scope, password string) error {
	setup, e := readSetup(root)
	if e != nil {
		return errors.New("configure the tunnel before installing a service")
	}
	if setup.Manager != "go-client" {
		return errors.New("legacy service manager detected; remove its auto-start registration before migrating to a Go service")
	}
	if localControl(root, "status") {
		return errors.New("stop the existing worker before changing service manager")
	}
	if scope == "system" && (account == "" || strings.EqualFold(account, "root")) {
		return errors.New("system service requires an explicitly selected unprivileged account")
	}
	if scope == "system" && runtime.GOOS != "windows" {
		if err := verifyServiceDataOwner(root, account); err != nil {
			return err
		}
	}
	cfg, e := daemonConfig(root, account, scope)
	if e != nil {
		return e
	}
	// The password is passed only in memory to the Windows service-control manager.
	if runtime.GOOS == "windows" {
		if password == "" {
			return errors.New("Windows service-account password required through hidden prompt or --password-stdin")
		}
		if strings.EqualFold(account, "LocalSystem") || strings.HasPrefix(strings.ToUpper(account), "NT AUTHORITY\\") {
			return errors.New("built-in and privileged service identities are not permitted")
		}
		if !strings.EqualFold(account, currentAccount()) {
			return errors.New("Windows service account must match the account that owns the private configuration")
		}
		cfg.Option["Password"] = password
	}
	s, e := kservice.New(&daemon{root: root}, cfg)
	if e != nil {
		return e
	}
	if e = writeNativeScope(root, scope, account); e != nil {
		return e
	}
	if e = s.Install(); e != nil {
		return fmt.Errorf("native service installation failed: %w", e)
	}
	setup, e = readSetup(root)
	if e != nil {
		return e
	}
	setup.Manager = "go-service"
	b, e := jsonMarshal(setup)
	if e != nil {
		return e
	}
	if e = writePrivate(filepath.Join(root, "runtime", "setup.json"), b); e != nil {
		_ = s.Uninstall()
		return e
	}
	return nil
}
func controlNative(root, action string) error {
	setup, e := readSetup(root)
	if e != nil {
		if action == "stop" && os.IsNotExist(e) {
			return nil
		}
		return errors.New("configure the tunnel first")
	}
	switch setup.Manager {
	case "go-service":
		// Control the installed native system/user service; no Bash or PowerShell.
		// Only the platform manager itself decides the effective account.
		s, e := nativeService(root, "", nativeScope(root))
		if e != nil {
			return e
		}
		if action == "start" {
			return s.Start()
		}
		return s.Stop()
	case "go-client":
		if action == "start" {
			return runDetached(root)
		}
		return stopWorker(root)
	default:
		// Backward compatible with existing installations; migration must be explicit.
		return errors.New("legacy manager unsupported; stop the old runtime before migration")
	}
}
func nativeScope(root string) string {
	b, e := os.ReadFile(filepath.Join(root, "runtime", "service.json"))
	if e != nil {
		return "user"
	}
	var m struct {
		Scope string `json:"scope"`
	}
	if json.Unmarshal(b, &m) != nil {
		return "user"
	}
	return m.Scope
}
func writeNativeScope(root, scope, account string) error {
	b, e := jsonMarshal(map[string]string{"scope": scope})
	if e != nil {
		return e
	}
	file := filepath.Join(root, "runtime", "service.json")
	if e = writePrivate(file, b); e != nil {
		return e
	}
	if scope == "system" && runtime.GOOS != "windows" {
		return assignServiceOwner(file, account)
	}
	return nil
}
func nativeState(root string) state {
	out := state{}
	setup, e := readSetup(root)
	if e != nil {
		return out
	}
	out.ID = setup.ID
	out.Manager = setup.Manager
	if _, e := os.Stat(filepath.Join(root, "runtime", "credentials.json")); e == nil {
		out.HasKey = true
	}
	if setup.Manager == "go-client" || setup.Manager == "go-service" {
		out.Managed = localControl(root, "status")
		out.Ready = out.Managed && tunnelHealth(root)
		if setup.Manager == "go-service" {
			enabled := true
			out.Autostart = &enabled
			srv, e := nativeService(root, "", nativeScope(root))
			if e != nil {
				out.Error = "Native service backend unavailable"
				return out
			}
			status, e := srv.Status()
			if e != nil {
				out.Error = "Native service not installed"
				out.Autostart = nil
				return out
			}
			out.Managed = status == kservice.StatusRunning
			out.Ready = out.Managed && tunnelHealth(root)
		}
		return out
	}
	return readLegacyState(root, out)
}
func readLegacyState(root string, s state) state {
	s.Error = "Legacy manager requires explicit migration"
	return s
}
func serveNative(root string) error {
	scope := nativeScope(root)
	// Configuration UserName does not matter while serving.
	srv, e := nativeService(root, "", scope)
	if e != nil {
		return e
	}
	return srv.Run()
}
func terminateNative(root string) error {
	setup, e := readSetup(root)
	if e != nil || setup.Manager != "go-service" {
		return errors.New("native service is not configured")
	}
	if localControl(root, "status") {
		return errors.New("stop the native service before uninstalling it")
	}
	srv, e := nativeService(root, "", nativeScope(root))
	if e != nil {
		return e
	}
	if e = srv.Uninstall(); e != nil {
		return e
	}
	setup.Manager = "go-client"
	raw, e := jsonMarshal(setup)
	if e != nil {
		return e
	}
	return writePrivate(filepath.Join(root, "runtime", "setup.json"), raw)
}
func waitUntilReady(root string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	for {
		if localControl(root, "status") && tunnelHealth(root) {
			return nil
		}
		select {
		case <-ctx.Done():
			return errors.New("tunnel not ready; check credentials and logs")
		case <-time.After(400 * time.Millisecond):
		}
	}
}
