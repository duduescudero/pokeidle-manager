using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Runtime.InteropServices;

// Native .NET Windows launcher. It only starts the existing CMD/Node backend.
// Accounts, purchases, sales and network messages remain in the original modules.
public static class DesktopLauncher {
  [DllImport("kernel32.dll")] static extern bool FreeConsole();
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [STAThread] public static void Main(){Run(AppDomain.CurrentDomain.BaseDirectory);}
  public static void Run(string folder){try{SetProcessDPIAware();}catch{}try{FreeConsole();}catch{}Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
    string entry=Path.Combine(folder,"Iniciar.cmd");
    if(!File.Exists(entry)){MessageBox.Show("Extraia a pasta completa do ZIP antes de iniciar.","PokeIdle Manager",MessageBoxButtons.OK,MessageBoxIcon.Warning);return;}
    int port=3847;int parsed;if(int.TryParse(Environment.GetEnvironmentVariable("POKEIDLE_LAUNCH_TEST_PORT"),out parsed)&&parsed>1024&&parsed<65536)port=parsed;
    try{using(var socket=new TcpClient()){var connected=socket.ConnectAsync("127.0.0.1",port);if(connected.Wait(300)&&socket.Connected){MessageBox.Show("O bot já está aberto. Clique no ícone do PokeIdle Manager na bandeja do Windows para mostrar o painel.","PokeIdle Manager",MessageBoxButtons.OK,MessageBoxIcon.Information);return;}}}catch{}
    var loading=new Form {Text="PokeIdle Manager",ClientSize=new Size(410,132),StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false,BackColor=Color.FromArgb(10,12,22),ForeColor=Color.FromArgb(234,240,249)};
    loading.Controls.Add(new Label {Text="Preparando seu painel…",Bounds=new Rectangle(24,18,360,32),Font=new Font("Segoe UI",14,FontStyle.Bold)});
    loading.Controls.Add(new Label {Text="Na primeira abertura, o runtime pode ser baixado.\nSuas contas continuam protegidas no Windows.",Bounds=new Rectangle(24,57,360,56),Font=new Font("Segoe UI",9),ForeColor=Color.FromArgb(146,160,180)});
    Process worker=null;var timer=new Timer {Interval=500};int waiting=0;
    loading.Shown+=(s,e)=>{try{worker=Process.Start(new ProcessStartInfo {FileName=Environment.GetEnvironmentVariable("ComSpec")??"cmd.exe",Arguments="/d /c \"\""+entry+"\" --background\"",WorkingDirectory=folder,UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden});timer.Start();}catch(Exception){MessageBox.Show("Não foi possível iniciar. Abra Iniciar.cmd para conferir o erro.","PokeIdle Manager");loading.Close();}};
    timer.Tick+=(s,e)=>{waiting++;if(worker!=null&&worker.HasExited){if(worker.ExitCode!=0)MessageBox.Show("Não foi possível iniciar o bot. Abra Iniciar.cmd para ver o erro.","PokeIdle Manager",MessageBoxButtons.OK,MessageBoxIcon.Warning);loading.Close();return;}try{using(var socket=new TcpClient()){var connected=socket.ConnectAsync("127.0.0.1",port);if(connected.Wait(50)&&socket.Connected){loading.Close();return;}}}catch{} if(waiting>=240)loading.Close();};
    loading.FormClosed+=(s,e)=>timer.Dispose();Application.Run(loading);loading.Dispose();
  }
}
