using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

internal sealed class JobConfig
{
    public int schemaVersion { get; set; }
    public string sessionId { get; set; }
    public string jobName { get; set; }
    public string stateRoot { get; set; }
    public string executable { get; set; }
    public string[] args { get; set; }
    public string cwd { get; set; }
    public Dictionary<string, string> environment { get; set; }
    public string authorizationId { get; set; }
    public string planDigest { get; set; }
    public string capability { get; set; }
    public bool holdBeforeSpawn { get; set; }
    public string tokenMode { get; set; }
    public int observationIntervalMilliseconds { get; set; }
    public string nativeFaultPoint { get; set; }
}

internal sealed class ProcessRecord
{
    public int processId { get; set; }
    public string processIdentity { get; set; }
}

internal sealed class TerminationRequest
{
    public int schemaVersion { get; set; }
    public string operationId { get; set; }
    public string reason { get; set; }
    public string capability { get; set; }
}

internal sealed class BrokerRelease
{
    public int schemaVersion { get; set; }
    public string sessionId { get; set; }
    public string capability { get; set; }
    public int brokerProcessId { get; set; }
    public string brokerProcessIdentity { get; set; }
}

internal sealed class Observation
{
    public int schemaVersion { get; set; }
    public string guarantee { get; set; }
    public List<ProcessRecord> knownProcesses { get; set; }
    public List<ProcessRecord> liveProcesses { get; set; }
    public int liveProcessCount { get; set; }
}

internal static class RalphWindowsJobHost
{
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const int JobObjectBasicProcessIdList = 3;
    private const int JobObjectExtendedLimitInformation = 9;
    private const int ERROR_ALREADY_EXISTS = 183;
    private const int ERROR_MORE_DATA = 234;
    private const uint CREATE_SUSPENDED = 0x00000004;
    private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
    private const uint CREATE_NO_WINDOW = 0x08000000;
    private const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
    private const int ERROR_INSUFFICIENT_BUFFER = 122;
    private static readonly IntPtr PROC_THREAD_ATTRIBUTE_JOB_LIST = new IntPtr(0x0002000D);
    private const uint WAIT_OBJECT_0 = 0;
    private const uint TOKEN_ASSIGN_PRIMARY = 0x0001;
    private const uint TOKEN_DUPLICATE = 0x0002;
    private const uint TOKEN_QUERY = 0x0008;
    private const uint TOKEN_ADJUST_DEFAULT = 0x0080;
    private const uint TOKEN_ADJUST_SESSIONID = 0x0100;
    private const uint DISABLE_MAX_PRIVILEGE = 0x00000001;
    private const uint SE_GROUP_INTEGRITY = 0x00000020;
    private const int TokenIntegrityLevel = 25;
    private const string Guarantee = "windows-job-object-kill-on-close-no-breakaway";

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public IntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct STARTUPINFO
    {
        public uint cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public uint dwX;
        public uint dwY;
        public uint dwXSize;
        public uint dwYSize;
        public uint dwXCountChars;
        public uint dwYCountChars;
        public uint dwFillAttribute;
        public uint dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct STARTUPINFOEX
    {
        public STARTUPINFO StartupInfo;
        public IntPtr lpAttributeList;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SID_AND_ATTRIBUTES
    {
        public IntPtr Sid;
        public uint Attributes;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct TOKEN_MANDATORY_LABEL
    {
        public SID_AND_ATTRIBUTES Label;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr attributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr job,
        int informationClass,
        IntPtr information,
        uint informationLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool QueryInformationJobObject(
        IntPtr job,
        int informationClass,
        IntPtr information,
        uint informationLength,
        out uint returnLength);

    [DllImport("advapi32.dll", EntryPoint = "CreateProcessAsUserW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcessAsUser(
        IntPtr token,
        string applicationName,
        StringBuilder commandLine,
        IntPtr processAttributes,
        IntPtr threadAttributes,
        bool inheritHandles,
        uint creationFlags,
        IntPtr environment,
        string currentDirectory,
        ref STARTUPINFOEX startupInfo,
        out PROCESS_INFORMATION processInformation);

    [DllImport("kernel32.dll", EntryPoint = "CreateProcessW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(
        string applicationName,
        StringBuilder commandLine,
        IntPtr processAttributes,
        IntPtr threadAttributes,
        bool inheritHandles,
        uint creationFlags,
        IntPtr environment,
        string currentDirectory,
        ref STARTUPINFOEX startupInfo,
        out PROCESS_INFORMATION processInformation);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool OpenProcessToken(
        IntPtr process,
        uint desiredAccess,
        out IntPtr token);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool CreateRestrictedToken(
        IntPtr existingToken,
        uint flags,
        uint disableSidCount,
        IntPtr sidsToDisable,
        uint deletePrivilegeCount,
        IntPtr privilegesToDelete,
        uint restrictedSidCount,
        IntPtr sidsToRestrict,
        out IntPtr newToken);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool SetTokenInformation(
        IntPtr token,
        int informationClass,
        IntPtr information,
        int informationLength);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool ConvertStringSidToSid(
        string stringSid,
        out IntPtr sid);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern uint GetLengthSid(IntPtr sid);

    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr memory);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool InitializeProcThreadAttributeList(
        IntPtr attributeList,
        int attributeCount,
        int flags,
        ref IntPtr size);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool UpdateProcThreadAttribute(
        IntPtr attributeList,
        uint flags,
        IntPtr attribute,
        IntPtr value,
        IntPtr size,
        IntPtr previousValue,
        IntPtr returnSize);

    [DllImport("kernel32.dll")]
    private static extern void DeleteProcThreadAttributeList(IntPtr attributeList);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateJobObject(IntPtr job, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

    public static int Main(string[] arguments)
    {
        if (arguments.Length != 2 || arguments[0] != "host")
        {
            Console.Error.WriteLine("usage: ralph-windows-job-host.exe host <config-path>");
            return 64;
        }
        string configPath = Path.GetFullPath(arguments[1]);
        JobConfig config = null;
        try
        {
            config = Json.Deserialize<JobConfig>(File.ReadAllText(configPath, Encoding.UTF8));
            ValidateConfig(config);
            return Run(config);
        }
        catch (Exception error)
        {
            if (config != null && !String.IsNullOrWhiteSpace(config.stateRoot))
            {
                try
                {
                    Directory.CreateDirectory(config.stateRoot);
                    WriteOnce(
                        Path.Combine(config.stateRoot, "failure.json"),
                        new Dictionary<string, object>
                        {
                            { "schemaVersion", 1 },
                            { "message", error.Message },
                            { "exceptionType", error.GetType().FullName }
                        });
                }
                catch
                {
                }
            }
            Console.Error.WriteLine(error.ToString());
            return 70;
        }
    }

    private static void ValidateConfig(JobConfig config)
    {
        if (config == null ||
            config.schemaVersion != 1 ||
            String.IsNullOrWhiteSpace(config.sessionId) ||
            String.IsNullOrWhiteSpace(config.jobName) ||
            String.IsNullOrWhiteSpace(config.stateRoot) ||
            String.IsNullOrWhiteSpace(config.executable) ||
            !Path.IsPathRooted(config.executable) ||
            String.IsNullOrWhiteSpace(config.cwd) ||
            !Path.IsPathRooted(config.cwd) ||
            config.args == null ||
            config.environment == null ||
            (config.tokenMode != "low-integrity" &&
                config.tokenMode != "trusted-wsl-bridge") ||
            String.IsNullOrWhiteSpace(config.authorizationId) ||
            String.IsNullOrWhiteSpace(config.planDigest) ||
            config.planDigest.Length != 64 ||
            String.IsNullOrWhiteSpace(config.capability) ||
            config.observationIntervalMilliseconds < 5 ||
            config.observationIntervalMilliseconds > 1000 ||
            (config.nativeFaultPoint != null &&
                config.nativeFaultPoint != "after-atomic-create-before-ready"))
        {
            throw new InvalidDataException("Windows Job Object configuration failed integrity validation");
        }
        config.stateRoot = Path.GetFullPath(config.stateRoot);
        config.executable = Path.GetFullPath(config.executable);
        config.cwd = Path.GetFullPath(config.cwd);
        if (!File.Exists(config.executable) || !Directory.Exists(config.cwd))
        {
            throw new InvalidDataException("Windows Job Object child path does not exist");
        }
    }

    private static int Run(JobConfig config)
    {
        Directory.CreateDirectory(config.stateRoot);
        ProcessRecord broker = ProcessRecordFor(Process.GetCurrentProcess().Id);
        if (!PublishBrokerClaim(config, broker)) return 0;
        if (!WaitForBrokerRelease(config, broker)) return 0;
        IntPtr job = IntPtr.Zero;
        PROCESS_INFORMATION child = new PROCESS_INFORMATION();
        IntPtr environment = IntPtr.Zero;
        FileStream brokerLiveness = null;
        bool childCreated = false;
        bool childResumed = false;
        Dictionary<string, ProcessRecord> known = new Dictionary<string, ProcessRecord>();
        try
        {
            job = CreateJobObject(IntPtr.Zero, config.jobName);
            if (job == IntPtr.Zero)
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateJobObject failed");
            }
            int createError = Marshal.GetLastWin32Error();
            if (createError == ERROR_ALREADY_EXISTS)
            {
                throw new InvalidOperationException("Job Object already exists; duplicate launch refused");
            }
            ArmKillOnClose(job);
            brokerLiveness = CreateBrokerLiveness(config);

            environment = Marshal.StringToHGlobalUni(BuildEnvironmentBlock(config.environment));
            StringBuilder commandLine = new StringBuilder(BuildCommandLine(config.executable, config.args));
            child = CreateProcessInJob(config, job, environment, commandLine);
            childCreated = true;

            ProcessRecord root = ProcessRecordFor((int)child.dwProcessId);
            known[RecordKey(root)] = root;
            if (config.nativeFaultPoint == "after-atomic-create-before-ready")
            {
                WriteOnce(
                    Path.Combine(config.stateRoot, "fault-child.json"),
                    new Dictionary<string, object>
                    {
                        { "schemaVersion", 1 },
                        { "faultPoint", config.nativeFaultPoint },
                        { "root", root }
                    });
                Environment.FailFast("injected crash after atomic Job Object assignment");
            }
            WriteOnce(
                Path.Combine(config.stateRoot, "ready.json"),
                new Dictionary<string, object>
                {
                    { "schemaVersion", 1 },
                    { "sessionId", config.sessionId },
                    { "guarantee", Guarantee },
                    { "jobNameDigest", Sha256(config.jobName) },
                    { "limitFlags", JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE },
                    { "breakawayAllowed", false },
                    { "tokenMode", config.tokenMode },
                    { "broker", broker },
                    { "root", root }
                });
            WriteObservation(config.stateRoot, job, known);

            if (config.holdBeforeSpawn)
            {
                string releasePath = Path.Combine(config.stateRoot, "launch-release");
                while (!File.Exists(releasePath))
                {
                    TerminationRequest heldTermination = ReadTermination(config);
                    if (heldTermination != null)
                    {
                        return TerminateAndFinalize(
                            config,
                            job,
                            child,
                            known,
                            heldTermination,
                            ref childCreated,
                            ref childResumed);
                    }
                    WriteObservation(config.stateRoot, job, known);
                    Thread.Sleep(config.observationIntervalMilliseconds);
                }
            }

            uint resumeResult = ResumeThread(child.hThread);
            if (resumeResult == UInt32.MaxValue)
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "ResumeThread failed");
            }
            childResumed = true;

            while (true)
            {
                WriteObservation(config.stateRoot, job, known);
                TerminationRequest termination = ReadTermination(config);
                if (termination != null)
                {
                    return TerminateAndFinalize(
                        config,
                        job,
                        child,
                        known,
                        termination,
                        ref childCreated,
                        ref childResumed);
                }
                if (WaitForSingleObject(child.hProcess, 0) == WAIT_OBJECT_0)
                {
                    uint exitCode;
                    if (!GetExitCodeProcess(child.hProcess, out exitCode))
                    {
                        throw new Win32Exception(Marshal.GetLastWin32Error(), "GetExitCodeProcess failed");
                    }
                    CloseHandle(job);
                    job = IntPtr.Zero;
                    WaitForKnownProcessesToExit(known, 10000);
                    WriteZeroObservation(config.stateRoot, known);
                    WriteCompletion(config.stateRoot, exitCode);
                    return 0;
                }
                Thread.Sleep(config.observationIntervalMilliseconds);
            }
        }
        finally
        {
            if (environment != IntPtr.Zero) Marshal.FreeHGlobal(environment);
            if (child.hThread != IntPtr.Zero) CloseHandle(child.hThread);
            if (child.hProcess != IntPtr.Zero) CloseHandle(child.hProcess);
            if (job != IntPtr.Zero) CloseHandle(job);
            if (brokerLiveness != null) brokerLiveness.Dispose();
        }
    }

    private static FileStream CreateBrokerLiveness(JobConfig config)
    {
        string livenessPath = Path.Combine(config.stateRoot, "broker-live");
        FileStream stream = new FileStream(
            livenessPath,
            FileMode.CreateNew,
            FileAccess.ReadWrite,
            FileShare.Read | FileShare.Delete,
            1,
            FileOptions.DeleteOnClose | FileOptions.WriteThrough);
        byte[] evidence = Encoding.UTF8.GetBytes(
            Sha256(config.sessionId + "\0" + config.capability) + "\n");
        stream.Write(evidence, 0, evidence.Length);
        stream.Flush(true);
        return stream;
    }

    private static bool PublishBrokerClaim(JobConfig config, ProcessRecord broker)
    {
        string claimPath = Path.Combine(config.stateRoot, "broker-claim.json");
        try
        {
            WriteOnce(
                claimPath,
                new Dictionary<string, object>
                {
                    { "schemaVersion", 1 },
                    { "sessionId", config.sessionId },
                    { "capabilitySha256", Sha256(config.capability) },
                    { "broker", broker }
                });
            return true;
        }
        catch (IOException)
        {
            if (File.Exists(claimPath)) return false;
            throw;
        }
    }

    private static bool WaitForBrokerRelease(JobConfig config, ProcessRecord broker)
    {
        string releasePath = Path.Combine(config.stateRoot, "broker-release.json");
        while (!File.Exists(releasePath))
        {
            TerminationRequest termination = ReadTermination(config);
            if (termination != null)
            {
                WriteEmptyTermination(config, termination);
                return false;
            }
            Thread.Sleep(config.observationIntervalMilliseconds);
        }
        BrokerRelease release = Json.Deserialize<BrokerRelease>(
            File.ReadAllText(releasePath, Encoding.UTF8));
        if (release == null ||
            release.schemaVersion != 1 ||
            release.sessionId != config.sessionId ||
            release.capability != config.capability ||
            release.brokerProcessId != broker.processId ||
            release.brokerProcessIdentity != broker.processIdentity)
        {
            throw new InvalidDataException("Job Object broker release failed integrity validation");
        }
        return true;
    }

    private static void WriteEmptyTermination(
        JobConfig config,
        TerminationRequest request)
    {
        string terminatedPath = Path.Combine(config.stateRoot, "terminated.json");
        if (!File.Exists(terminatedPath))
        {
            WriteOnce(
                terminatedPath,
                new Dictionary<string, object>
                {
                    { "schemaVersion", 1 },
                    { "kind", "contained-processes-terminated" },
                    { "sessionId", config.sessionId },
                    { "operationId", request.operationId },
                    { "reason", request.reason },
                    { "guarantee", Guarantee },
                    { "processTreeTerminated", true },
                    { "knownProcesses", new List<ProcessRecord>() },
                    { "liveProcesses", new List<ProcessRecord>() },
                    { "liveProcessCount", 0 }
                });
        }
        string completedPath = Path.Combine(config.stateRoot, "completed.json");
        if (!File.Exists(completedPath)) WriteCompletion(config.stateRoot, 0);
    }

    private static PROCESS_INFORMATION CreateProcessInJob(
        JobConfig config,
        IntPtr job,
        IntPtr environment,
        StringBuilder commandLine)
    {
        IntPtr attributeList = IntPtr.Zero;
        IntPtr jobList = IntPtr.Zero;
        IntPtr restrictedToken = IntPtr.Zero;
        try
        {
            IntPtr attributeListSize = IntPtr.Zero;
            InitializeProcThreadAttributeList(
                IntPtr.Zero,
                1,
                0,
                ref attributeListSize);
            int sizingError = Marshal.GetLastWin32Error();
            if (attributeListSize == IntPtr.Zero || sizingError != ERROR_INSUFFICIENT_BUFFER)
            {
                throw new Win32Exception(sizingError, "Job attribute-list sizing failed");
            }
            attributeList = Marshal.AllocHGlobal(attributeListSize);
            if (!InitializeProcThreadAttributeList(
                attributeList,
                1,
                0,
                ref attributeListSize))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "Job attribute-list initialization failed");
            }
            jobList = Marshal.AllocHGlobal(IntPtr.Size);
            Marshal.WriteIntPtr(jobList, job);
            if (!UpdateProcThreadAttribute(
                attributeList,
                0,
                PROC_THREAD_ATTRIBUTE_JOB_LIST,
                jobList,
                new IntPtr(IntPtr.Size),
                IntPtr.Zero,
                IntPtr.Zero))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "Job-list process attribute failed");
            }

            STARTUPINFOEX startup = new STARTUPINFOEX();
            startup.StartupInfo.cb = (uint)Marshal.SizeOf(typeof(STARTUPINFOEX));
            startup.lpAttributeList = attributeList;
            PROCESS_INFORMATION child;
            uint creationFlags = CREATE_SUSPENDED |
                CREATE_UNICODE_ENVIRONMENT |
                CREATE_NO_WINDOW |
                EXTENDED_STARTUPINFO_PRESENT;
            bool created;
            if (config.tokenMode == "trusted-wsl-bridge")
            {
                created = CreateProcess(
                    config.executable,
                    commandLine,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    false,
                    creationFlags,
                    environment,
                    config.cwd,
                    ref startup,
                    out child);
            }
            else
            {
                restrictedToken = CreateLowIntegrityToken();
                created = CreateProcessAsUser(
                    restrictedToken,
                    config.executable,
                    commandLine,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    false,
                    creationFlags,
                    environment,
                    config.cwd,
                    ref startup,
                    out child);
            }
            if (!created)
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    config.tokenMode == "trusted-wsl-bridge"
                        ? "CreateProcessW failed for trusted WSL bridge"
                        : "CreateProcessAsUserW failed");
            }
            return child;
        }
        finally
        {
            if (attributeList != IntPtr.Zero)
            {
                DeleteProcThreadAttributeList(attributeList);
                Marshal.FreeHGlobal(attributeList);
            }
            if (jobList != IntPtr.Zero) Marshal.FreeHGlobal(jobList);
            if (restrictedToken != IntPtr.Zero) CloseHandle(restrictedToken);
        }
    }

    private static IntPtr CreateLowIntegrityToken()
    {
        IntPtr sourceToken = IntPtr.Zero;
        IntPtr restrictedToken = IntPtr.Zero;
        IntPtr lowIntegritySid = IntPtr.Zero;
        IntPtr labelBuffer = IntPtr.Zero;
        try
        {
            uint access = TOKEN_ASSIGN_PRIMARY |
                TOKEN_DUPLICATE |
                TOKEN_QUERY |
                TOKEN_ADJUST_DEFAULT |
                TOKEN_ADJUST_SESSIONID;
            if (!OpenProcessToken(GetCurrentProcess(), access, out sourceToken))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "OpenProcessToken failed");
            }
            if (!CreateRestrictedToken(
                sourceToken,
                DISABLE_MAX_PRIVILEGE,
                0,
                IntPtr.Zero,
                0,
                IntPtr.Zero,
                0,
                IntPtr.Zero,
                out restrictedToken))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "CreateRestrictedToken failed");
            }
            if (!ConvertStringSidToSid("S-1-16-4096", out lowIntegritySid))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "low-integrity SID creation failed");
            }
            TOKEN_MANDATORY_LABEL label = new TOKEN_MANDATORY_LABEL();
            label.Label.Sid = lowIntegritySid;
            label.Label.Attributes = SE_GROUP_INTEGRITY;
            int labelSize = Marshal.SizeOf(typeof(TOKEN_MANDATORY_LABEL));
            labelBuffer = Marshal.AllocHGlobal(labelSize);
            Marshal.StructureToPtr(label, labelBuffer, false);
            int informationSize = checked(labelSize + (int)GetLengthSid(lowIntegritySid));
            if (!SetTokenInformation(
                restrictedToken,
                TokenIntegrityLevel,
                labelBuffer,
                informationSize))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "low-integrity token labeling failed");
            }
            IntPtr result = restrictedToken;
            restrictedToken = IntPtr.Zero;
            return result;
        }
        finally
        {
            if (labelBuffer != IntPtr.Zero) Marshal.FreeHGlobal(labelBuffer);
            if (lowIntegritySid != IntPtr.Zero) LocalFree(lowIntegritySid);
            if (restrictedToken != IntPtr.Zero) CloseHandle(restrictedToken);
            if (sourceToken != IntPtr.Zero) CloseHandle(sourceToken);
        }
    }

    private static int TerminateAndFinalize(
        JobConfig config,
        IntPtr job,
        PROCESS_INFORMATION child,
        Dictionary<string, ProcessRecord> known,
        TerminationRequest request,
        ref bool childCreated,
        ref bool childResumed)
    {
        if (!TerminateJobObject(job, 137))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "TerminateJobObject failed");
        }
        DateTime deadline = DateTime.UtcNow.AddSeconds(10);
        while (true)
        {
            List<ProcessRecord> live = QueryJobProcesses(job);
            MergeKnown(known, live);
            if (live.Count == 0) break;
            if (DateTime.UtcNow >= deadline)
            {
                throw new TimeoutException("Job Object did not reach zero active processes");
            }
            Thread.Sleep(config.observationIntervalMilliseconds);
        }
        WriteZeroObservation(config.stateRoot, known);
        WriteOnce(
            Path.Combine(config.stateRoot, "terminated.json"),
            new Dictionary<string, object>
            {
                { "schemaVersion", 1 },
                { "kind", "contained-processes-terminated" },
                { "sessionId", config.sessionId },
                { "operationId", request.operationId },
                { "reason", request.reason },
                { "guarantee", Guarantee },
                { "processTreeTerminated", true },
                { "knownProcesses", known.Values.OrderBy(record => record.processId).ToList() },
                { "liveProcesses", new List<ProcessRecord>() },
                { "liveProcessCount", 0 }
            });
        uint exitCode = 137;
        if (childCreated)
        {
            WaitForSingleObject(child.hProcess, 10000);
            uint observedExitCode;
            if (GetExitCodeProcess(child.hProcess, out observedExitCode)) exitCode = observedExitCode;
        }
        WriteCompletion(config.stateRoot, exitCode);
        return 0;
    }

    private static void ArmKillOnClose(IntPtr job)
    {
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        int size = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
        IntPtr buffer = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(limits, buffer, false);
            if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, buffer, (uint)size))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "SetInformationJobObject failed");
            }
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static List<ProcessRecord> QueryJobProcesses(IntPtr job)
    {
        int capacity = 16;
        while (capacity <= 65536)
        {
            int size = 8 + capacity * IntPtr.Size;
            IntPtr buffer = Marshal.AllocHGlobal(size);
            try
            {
                uint returned;
                bool success = QueryInformationJobObject(
                    job,
                    JobObjectBasicProcessIdList,
                    buffer,
                    (uint)size,
                    out returned);
                if (!success)
                {
                    int error = Marshal.GetLastWin32Error();
                    if (error == ERROR_MORE_DATA)
                    {
                        capacity *= 2;
                        continue;
                    }
                    throw new Win32Exception(error, "QueryInformationJobObject failed");
                }
                uint count = (uint)Marshal.ReadInt32(buffer, 4);
                List<ProcessRecord> records = new List<ProcessRecord>();
                for (uint index = 0; index < count; index++)
                {
                    long pidValue = IntPtr.Size == 8
                        ? Marshal.ReadInt64(buffer, 8 + (int)index * IntPtr.Size)
                        : Marshal.ReadInt32(buffer, 8 + (int)index * IntPtr.Size);
                    if (pidValue <= 0 || pidValue > Int32.MaxValue) continue;
                    try
                    {
                        records.Add(ProcessRecordFor((int)pidValue));
                    }
                    catch (ArgumentException)
                    {
                    }
                    catch (InvalidOperationException)
                    {
                    }
                }
                return records.OrderBy(record => record.processId).ToList();
            }
            finally
            {
                Marshal.FreeHGlobal(buffer);
            }
        }
        throw new InvalidOperationException("Job Object process list exceeded its safety bound");
    }

    private static ProcessRecord ProcessRecordFor(int processId)
    {
        Process process = Process.GetProcessById(processId);
        try
        {
            return new ProcessRecord
            {
                processId = processId,
                processIdentity = "windows-start-ticks:" +
                    process.StartTime.ToUniversalTime().Ticks.ToString()
            };
        }
        finally
        {
            process.Dispose();
        }
    }

    private static string RecordKey(ProcessRecord record)
    {
        return record.processId.ToString() + ":" + record.processIdentity;
    }

    private static void MergeKnown(
        Dictionary<string, ProcessRecord> known,
        IEnumerable<ProcessRecord> records)
    {
        foreach (ProcessRecord record in records) known[RecordKey(record)] = record;
    }

    private static void WriteObservation(
        string stateRoot,
        IntPtr job,
        Dictionary<string, ProcessRecord> known)
    {
        List<ProcessRecord> live = QueryJobProcesses(job);
        MergeKnown(known, live);
        WriteReplacing(
            Path.Combine(stateRoot, "observation.json"),
            new Observation
            {
                schemaVersion = 1,
                guarantee = Guarantee,
                knownProcesses = known.Values.OrderBy(record => record.processId).ToList(),
                liveProcesses = live,
                liveProcessCount = live.Count
            });
    }

    private static void WriteZeroObservation(
        string stateRoot,
        Dictionary<string, ProcessRecord> known)
    {
        WriteReplacing(
            Path.Combine(stateRoot, "observation.json"),
            new Observation
            {
                schemaVersion = 1,
                guarantee = Guarantee,
                knownProcesses = known.Values.OrderBy(record => record.processId).ToList(),
                liveProcesses = new List<ProcessRecord>(),
                liveProcessCount = 0
            });
    }

    private static void WaitForKnownProcessesToExit(
        Dictionary<string, ProcessRecord> known,
        int timeoutMilliseconds)
    {
        DateTime deadline = DateTime.UtcNow.AddMilliseconds(timeoutMilliseconds);
        while (known.Values.Any(IsSameProcessAlive))
        {
            if (DateTime.UtcNow >= deadline)
            {
                throw new TimeoutException("Job Object members survived handle closure");
            }
            Thread.Sleep(20);
        }
    }

    private static bool IsSameProcessAlive(ProcessRecord record)
    {
        try
        {
            ProcessRecord observed = ProcessRecordFor(record.processId);
            return observed.processIdentity == record.processIdentity;
        }
        catch (ArgumentException)
        {
            return false;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
    }

    private static TerminationRequest ReadTermination(JobConfig config)
    {
        string requestPath = Path.Combine(config.stateRoot, "termination-request.json");
        if (!File.Exists(requestPath)) return null;
        TerminationRequest request = Json.Deserialize<TerminationRequest>(
            File.ReadAllText(requestPath, Encoding.UTF8));
        if (request == null ||
            request.schemaVersion != 1 ||
            String.IsNullOrWhiteSpace(request.operationId) ||
            String.IsNullOrWhiteSpace(request.reason) ||
            request.capability != config.capability)
        {
            throw new InvalidDataException("Job Object termination request failed integrity validation");
        }
        return request;
    }

    private static void WriteCompletion(string stateRoot, uint exitCode)
    {
        WriteOnce(
            Path.Combine(stateRoot, "completed.json"),
            new Dictionary<string, object>
            {
                { "schemaVersion", 1 },
                { "exitCode", (long)exitCode },
                { "signal", null }
            });
    }

    private static string BuildCommandLine(string executable, string[] arguments)
    {
        List<string> values = new List<string>();
        values.Add(QuoteArgument(executable));
        values.AddRange(arguments.Select(QuoteArgument));
        return String.Join(" ", values.ToArray());
    }

    private static string QuoteArgument(string value)
    {
        if (value.Length > 0 && value.IndexOfAny(new char[] { ' ', '\t', '\n', '\v', '"' }) < 0)
        {
            return value;
        }
        StringBuilder quoted = new StringBuilder();
        quoted.Append('"');
        int backslashes = 0;
        foreach (char character in value)
        {
            if (character == '\\')
            {
                backslashes++;
                continue;
            }
            if (character == '"')
            {
                quoted.Append('\\', backslashes * 2 + 1);
                quoted.Append('"');
                backslashes = 0;
                continue;
            }
            quoted.Append('\\', backslashes);
            backslashes = 0;
            quoted.Append(character);
        }
        quoted.Append('\\', backslashes * 2);
        quoted.Append('"');
        return quoted.ToString();
    }

    private static string BuildEnvironmentBlock(Dictionary<string, string> environment)
    {
        StringBuilder block = new StringBuilder();
        foreach (KeyValuePair<string, string> entry in environment.OrderBy(
            pair => pair.Key,
            StringComparer.OrdinalIgnoreCase))
        {
            block.Append(entry.Key);
            block.Append('=');
            block.Append(entry.Value);
            block.Append('\0');
        }
        block.Append('\0');
        return block.ToString();
    }

    private static string Sha256(string value)
    {
        using (SHA256 hash = SHA256.Create())
        {
            byte[] digest = hash.ComputeHash(Encoding.UTF8.GetBytes(value));
            return BitConverter.ToString(digest).Replace("-", "").ToLowerInvariant();
        }
    }

    private static void WriteOnce(string path, object value)
    {
        string content = Json.Serialize(value) + Environment.NewLine;
        string candidate = path + ".candidate-" + Process.GetCurrentProcess().Id.ToString() +
            "-" + Guid.NewGuid().ToString("N");
        using (FileStream stream = new FileStream(
            candidate,
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None))
        using (StreamWriter writer = new StreamWriter(stream, new UTF8Encoding(false)))
        {
            writer.Write(content);
            writer.Flush();
            stream.Flush(true);
        }
        try
        {
            File.Move(candidate, path);
        }
        catch (IOException)
        {
            if (!File.Exists(path) || File.ReadAllText(path, Encoding.UTF8) != content)
            {
                throw;
            }
        }
        finally
        {
            if (File.Exists(candidate)) File.Delete(candidate);
        }
    }

    private static void WriteReplacing(string path, object value)
    {
        string candidate = path + ".candidate-" + Process.GetCurrentProcess().Id.ToString() +
            "-" + Guid.NewGuid().ToString("N");
        string content = Json.Serialize(value) + Environment.NewLine;
        using (FileStream stream = new FileStream(
            candidate,
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None))
        using (StreamWriter writer = new StreamWriter(stream, new UTF8Encoding(false)))
        {
            writer.Write(content);
            writer.Flush();
            stream.Flush(true);
        }
        if (File.Exists(path))
        {
            File.Replace(candidate, path, null);
        }
        else
        {
            File.Move(candidate, path);
        }
    }
}
