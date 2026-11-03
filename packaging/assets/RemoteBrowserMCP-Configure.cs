using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--self-test") return 0;
        try
        {
            string root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));
            string client = Path.Combine(root, "bin", "remotebrowsermcp.exe");
            if (!File.Exists(client))
                throw new FileNotFoundException("RemoteBrowserMCP client was not installed.", client);
            using (Process process = new Process())
            {
                process.StartInfo.FileName = client;
                process.StartInfo.Arguments = "gui";
                process.StartInfo.WorkingDirectory = root;
                process.StartInfo.UseShellExecute = false;
                process.StartInfo.CreateNoWindow = true;
                if (!process.Start()) throw new InvalidOperationException("Could not launch the configuration client.");
            }
            return 0;
        }
        catch (Exception e)
        {
            MessageBox.Show(e.Message, "RemoteBrowserMCP", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
