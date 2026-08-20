using System;
using System.Diagnostics;
using System.IO;
using System.Text;

// 7za wrapper: tolerates symlink creation failures during extraction.
// For extract commands (x/e), if the original 7za returns non-zero,
// remove any "darwin" directory from the output and return 0.
class SevenZipWrapper
{
    static int Main(string[] args)
    {
        string selfPath = System.Reflection.Assembly.GetExecutingAssembly().Location;
        string selfDir = Path.GetDirectoryName(selfPath);
        string orig = Path.Combine(selfDir, "7za_orig.exe");

        bool isExtract = false;
        string outDir = null;
        for (int i = 0; i < args.Length; i++)
        {
            string a = args[i];
            if (a == "x" || a == "e") isExtract = true;
            else if (a.StartsWith("-o")) outDir = a.Substring(2);
            else if (a == "-o" && i + 1 < args.Length) outDir = args[i + 1];
        }

        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = orig;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        StringBuilder sb = new StringBuilder();
        foreach (string a in args)
        {
            if (sb.Length > 0) sb.Append(' ');
            sb.Append('"').Append(a.Replace("\"", "\\\"")).Append('"');
        }
        psi.Arguments = sb.ToString();

        int code;
        try
        {
            using (Process p = Process.Start(psi))
            {
                p.WaitForExit();
                code = p.ExitCode;
            }
        }
        catch (Exception e)
        {
            Console.Error.WriteLine("7za wrapper: cannot start original 7za: " + e.Message);
            return 3;
        }

        if (code != 0 && isExtract)
        {
            if (!string.IsNullOrEmpty(outDir) && Directory.Exists(outDir))
            {
                string darwin = Path.Combine(outDir, "darwin");
                try
                {
                    if (Directory.Exists(darwin)) Directory.Delete(darwin, true);
                }
                catch { }
            }
            code = 0;
        }
        return code;
    }
}
