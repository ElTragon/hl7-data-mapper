param([Parameter(Mandatory = $true)][string]$Payload)

$ErrorActionPreference = 'Stop'

# Own the job in this supervisor, before starting Node. Child processes inherit
# job membership, so cleanup does not depend on a living pnpm parent or PID walks.
# https://learn.microsoft.com/windows/win32/procthread/job-objects
try {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class DevProcessJob
{
    [StructLayout(LayoutKind.Sequential)]
    struct BasicLimits
    {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
        public uint ActiveProcesses;
        public UIntPtr Affinity;
        public uint Priority, SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct ExtendedLimits
    {
        public BasicLimits Basic;
        public ulong ReadOperations, WriteOperations, OtherOperations;
        public ulong ReadBytes, WriteBytes, OtherBytes;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr CreateJobObject(IntPtr attributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetInformationJobObject(IntPtr job, int kind,
        ref ExtendedLimits limits, uint size);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    // ProcessStartInfo.ArgumentList is unavailable in Windows PowerShell 5.1.
    // Quote each argument using Windows CRT rules, including trailing slashes.
    static string Quote(string value)
    {
        var result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char character in value)
        {
            if (character == '\\') { slashes++; continue; }
            result.Append('\\', character == '"' ? slashes * 2 + 1 : slashes);
            result.Append(character);
            slashes = 0;
        }
        result.Append('\\', slashes * 2);
        return result.Append('"').ToString();
    }

    public static void Run(string executable, string[] arguments)
    {
        int exitCode = 1;
        try
        {
            IntPtr job = CreateJobObject(IntPtr.Zero, null);
            if (job == IntPtr.Zero) throw new Win32Exception();
            var limits = new ExtendedLimits();
            limits.Basic.Flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            if (!SetInformationJobObject(job, 9, ref limits,
                (uint)Marshal.SizeOf(typeof(ExtendedLimits))))
                throw new Win32Exception();
            if (!AssignProcessToJobObject(job, Process.GetCurrentProcess().Handle))
                throw new Win32Exception();

            var quoted = new string[arguments.Length];
            for (int i = 0; i < arguments.Length; i++) quoted[i] = Quote(arguments[i]);
            var start = new ProcessStartInfo(executable, String.Join(" ", quoted));
            start.UseShellExecute = false;
            using (var child = Process.Start(start))
            {
                child.WaitForExit();
                exitCode = child.ExitCode;
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("Development process supervisor: " + error.Message);
        }
        // Keep the non-inheritable job handle until process exit. Windows closes
        // it even on forced termination, killing all remaining descendants.
        Environment.Exit(exitCode);
    }
}
'@
    $command = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
    [DevProcessJob]::Run([string]$command.executable, [string[]]$command.args)
}
catch {
    [Console]::Error.WriteLine("Development process supervisor: " + $_.Exception.Message)
    exit 1
}
