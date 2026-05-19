# 关闭企业微信崩溃后的「错误报告」顶层窗口（向窗口发送 WM_CLOSE，等效于点「确定」关闭对话框）
# 仅处理标题含「错误报告」且进程为 WXWork 的窗口，避免误关其它程序

$ErrorActionPreference = 'Stop'

$csSource = @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public class WeComCrashDialogCloser {
  public delegate bool EnumDelegate(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  private static extern bool EnumWindows(EnumDelegate lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll")]
  private static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

  [DllImport("user32.dll")]
  private static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

  private const uint WM_CLOSE = 0x0010;

  private static bool IsWxWorkProcess(uint pid) {
    if (pid == 0) return false;
    try {
      using (var p = Process.GetProcessById((int)pid)) {
        string name = (p.ProcessName ?? string.Empty).ToLowerInvariant();
        if (name == "wxwork") return true;
        try {
          string path = p.MainModule != null ? p.MainModule.FileName : null;
          if (!string.IsNullOrEmpty(path) &&
              path.EndsWith("WXWork.exe", StringComparison.OrdinalIgnoreCase))
            return true;
        } catch {
          /* 部分环境访问 MainModule 需要权限 */
        }
      }
    } catch {
      return false;
    }
    return false;
  }

  public static int CloseMatchingDialogs() {
    int closed = 0;
    EnumDelegate del = delegate(IntPtr hWnd, IntPtr lParam) {
      if (!IsWindowVisible(hWnd)) return true;
      var sb = new StringBuilder(512);
      GetWindowText(hWnd, sb, sb.Capacity);
      string title = sb.ToString();
      if (string.IsNullOrEmpty(title)) return true;
      if (title.IndexOf("\u9519\u8bef\u62a5\u544a", StringComparison.Ordinal) < 0)
        return true;

      uint pid;
      GetWindowThreadProcessId(hWnd, out pid);
      if (!IsWxWorkProcess(pid)) return true;

      PostMessage(hWnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
      closed++;
      return true;
    };
    EnumWindows(del, IntPtr.Zero);
    return closed;
  }
}
'@

Add-Type -TypeDefinition $csSource -Language CSharp
$n = [WeComCrashDialogCloser]::CloseMatchingDialogs()
Write-Output ("CLOSED:" + $n)
