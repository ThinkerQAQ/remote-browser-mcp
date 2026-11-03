// Windows user-level UI entry points. Compiled with /target:winexe and the
// bundled RemoteBrowserMCP icon. No tunnel IDs, API keys, or credentials on argv.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

internal static class RemoteBrowserLauncher
{
    private static string Root {
        get {
            string directory = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
#if MAINTENANCE
            return directory;
#else
            return Directory.GetParent(directory).FullName;
#endif
        }
    }

    private static void Launch(string filename, string arguments)
    {
        string path = Path.Combine(Root, filename);
        if (!File.Exists(path)) {
            MessageBox.Show("Missing installed application file:\n" + path,
                "RemoteBrowserMCP", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        var info = new ProcessStartInfo();
        info.FileName = path;
        info.Arguments = arguments;
        info.WorkingDirectory = Root;
        info.UseShellExecute = true;
        Process.Start(info);
    }

    private static void Configure()
    {
        // The configuration form is owned by a native RemoteBrowserMCP WinExe,
        // and its taskbar icon is the embedded app icon.
        Launch(Path.Combine("bin", "RemoteBrowserMCP-Configure.exe"), "");
    }

    private static Form CreateManagementWindow()
    {
        var form = new Form();
        form.Text = "RemoteBrowserMCP - Manage";
        form.StartPosition = FormStartPosition.CenterScreen;
        form.Size = new Size(465, 250);
        form.MinimumSize = form.Size;
        form.MaximumSize = form.Size;
        form.MaximizeBox = false;
        string icon = Path.Combine(Root, "brand", "remotebrowsermcp.ico");
        if (File.Exists(icon)) form.Icon = new Icon(icon);

        var title = new Label();
        title.Text = "Manage RemoteBrowserMCP";
        title.Location = new Point(25, 18);
        title.Size = new Size(405, 25);
        title.Font = new Font(title.Font, FontStyle.Bold);
        form.Controls.Add(title);

        var explanation = new Label();
        explanation.Text = "Change your Tunnel settings or uninstall the application.";
        explanation.Location = new Point(25, 49);
        explanation.Size = new Size(405, 43);
        form.Controls.Add(explanation);

        var change = new Button();
        change.Text = "Modify Tunnel Configuration";
        change.Location = new Point(25, 112);
        change.Size = new Size(248, 36);
        change.Click += (sender, args) => Configure();
        form.Controls.Add(change);

        var uninstall = new Button();
        uninstall.Text = "Uninstall...";
        uninstall.Location = new Point(285, 112);
        uninstall.Size = new Size(145, 36);
        uninstall.Click += (sender, args) => {
            var decision = MessageBox.Show(
                "Open the Qt maintenance tool to remove RemoteBrowserMCP?\n\nBack up local runtime settings first. If a Tunnel is running, stop it before uninstalling.",
                "Confirm uninstall", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
            if (decision != DialogResult.Yes) return;
            string client = Path.Combine(Root, "bin", "remotebrowsermcp.exe");

            if (File.Exists(client)) {
                // Stop only the current installation's user-level task, never
                // a WSL service or an unrelated Tunnel ID.
                var stopInfo = new ProcessStartInfo(client, "stop");
                stopInfo.WorkingDirectory = Root;
                stopInfo.UseShellExecute = false;
                stopInfo.CreateNoWindow = true;
                stopInfo.WindowStyle = ProcessWindowStyle.Hidden;
                using (var stop = Process.Start(stopInfo)) {
                    if (!stop.WaitForExit(15000) || stop.ExitCode != 0) {
                        MessageBox.Show("Could not stop this installation's Tunnel. Stop it before uninstalling.",
                            "RemoteBrowserMCP", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }
                }
            }
            Launch("RemoteBrowserMCP-Uninstaller.exe", "");
            form.Close();
        };
        form.Controls.Add(uninstall);

        var hint = new Label();
        hint.Text = "Changing the Tunnel does not delete your existing configuration.";
        hint.Location = new Point(25, 165);
        hint.Size = new Size(405, 34);
        form.Controls.Add(hint);
        return form;
    }

    [STAThread]
    private static int Main(string[] args)
    {
        try {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            if (args.Length == 1 && args[0] == "--self-test") {
                if (!File.Exists(Path.Combine(Root, "brand", "remotebrowsermcp.ico"))) return 5;
#if MAINTENANCE
                using (var form = CreateManagementWindow()) {
                    bool hasModify = false, hasUninstall = false;
                    foreach (Control c in form.Controls) {
                        var button = c as Button;
                        if (button == null) continue;
                        if (button.Text == "Modify Tunnel Configuration") hasModify = true;
                        if (button.Text == "Uninstall...") hasUninstall = true;
                    }
                    return hasModify && hasUninstall && form.Icon != null ? 0 : 6;
                }
#else
                return File.Exists(Path.Combine(Root, "bin", "remotebrowsermcp.exe")) ? 0 : 7;
#endif
            }
#if MAINTENANCE
            Application.Run(CreateManagementWindow());
#else
            Configure();
#endif
            return 0;
        } catch (Exception e) {
            MessageBox.Show("RemoteBrowserMCP could not start: " + e.Message,
                "RemoteBrowserMCP", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
