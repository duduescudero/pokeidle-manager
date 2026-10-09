using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace PokeidleDesktop {
  // Windows APIs are restricted to presentation: DPI, window chrome, dragging and painting.
  public static class DesktopNative {
    [DllImport("uxtheme.dll",CharSet=CharSet.Unicode)] public static extern int SetWindowTheme(IntPtr hwnd,string app,string id);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("kernel32.dll")] static extern bool FreeConsole();
    [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr icon);
    [DllImport("user32.dll")] public static extern bool ReleaseCapture();
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hwnd,int msg,IntPtr w,IntPtr l);
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd,int attr,ref int value,int size);
    public static void Prepare(){try{SetProcessDPIAware();}catch{} try{FreeConsole();}catch{}}
    public static void RoundWindow(IntPtr hwnd){try{int preference=2;DwmSetWindowAttribute(hwnd,33,ref preference,4);}catch{}}
    public static void Drag(Form form){ReleaseCapture();SendMessage(form.Handle,0xA1,new IntPtr(2),IntPtr.Zero);}
  }
  public static class Motion {
    public static Color Blend(Color a,Color b,double t){t=Math.Max(0,Math.Min(1,t));return Color.FromArgb((int)(a.R+(b.R-a.R)*t),(int)(a.G+(b.G-a.G)*t),(int)(a.B+(b.B-a.B)*t));}
    public static bool Enabled {get{return !SystemInformation.TerminalServerSession&&!SystemInformation.HighContrast;}}
  }
  // Own-drawn CheckBox keeps the native Checked/keyboard/accessibility contract intact.
  public class ToggleSwitch:CheckBox {
    Timer animation=new Timer {Interval=16};double position;bool hover;
    public ToggleSwitch(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);FlatStyle=FlatStyle.Flat;AutoSize=false;SetStyle(ControlStyles.Opaque,true);Cursor=Cursors.Hand;AccessibleRole=AccessibleRole.CheckButton;animation.Tick+=(s,e)=>{double target=Checked?1:0;position+=(target-position)*0.24;if(Math.Abs(position-target)<0.015){position=target;animation.Stop();}Invalidate();};}
    protected override void OnCheckedChanged(EventArgs e){if(IsHandleCreated&&Visible&&Motion.Enabled)animation.Start();else position=Checked?1:0;Invalidate();base.OnCheckedChanged(e);}
    protected override void OnMouseEnter(EventArgs e){hover=true;Invalidate();base.OnMouseEnter(e);}
    protected override void OnMouseLeave(EventArgs e){hover=false;Invalidate();base.OnMouseLeave(e);}
    // Never reuse the native checkbox background: it can leave stale text during repaint.
    protected override void OnPaintBackground(PaintEventArgs e){using(var background=new SolidBrush(Parent==null?Theme.Bg:Parent.BackColor))e.Graphics.FillRectangle(background,ClientRectangle);}
    protected override void OnPaint(PaintEventArgs e){OnPaintBackground(e);var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;int y=(Height-20)/2;var track=new Rectangle(0,y,38,20);using(var p=Theme.Round(track,10))using(var b=new SolidBrush(Enabled?Motion.Blend(hover?Theme.Edge:Theme.Input,Theme.Purple,position):Theme.Edge))g.FillPath(b,p);using(var b=new SolidBrush(Enabled?Theme.Text:Theme.Muted))g.FillEllipse(b,3+(int)(position*18),y+3,14,14);TextRenderer.DrawText(g,Text,Font,new Rectangle(50,0,Math.Max(1,Width-50),Height),Enabled?ForeColor:Theme.Muted,TextFormatFlags.VerticalCenter|TextFormatFlags.EndEllipsis);if(Focused&&ShowFocusCues)ControlPaint.DrawFocusRectangle(g,new Rectangle(47,1,Width-49,Height-2),Theme.Purple,BackColor);}
    protected override void Dispose(bool disposing){if(disposing)animation.Dispose();base.Dispose(disposing);}
  }
  public class SmoothPanel:Panel {public SmoothPanel(){DoubleBuffered=true;ResizeRedraw=true;}protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);try{DesktopNative.SetWindowTheme(Handle,"DarkMode_Explorer",null);}catch{}}}
  public class FieldFrame:Panel {public FieldFrame(){DoubleBuffered=true;BackColor=Theme.Surface;}protected override void OnPaint(PaintEventArgs e){e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(var p=Theme.Round(new Rectangle(0,0,Width-1,Height-1),7)){using(var b=new SolidBrush(Theme.Input))e.Graphics.FillPath(b,p);using(var pen=new Pen(ContainsFocus?Theme.Purple:Theme.Edge))e.Graphics.DrawPath(pen,p);}}}
  public class ModernNumeric:NumericUpDown {
    bool framing;
    public ModernNumeric(){BorderStyle=BorderStyle.None;BackColor=Theme.Input;ForeColor=Theme.Text;Font=Theme.Font(11);}
    protected override void OnParentChanged(EventArgs e){base.OnParentChanged(e);if(framing||Parent==null||Parent is FieldFrame)return;framing=true;var owner=Parent;var bounds=Bounds;var frame=new FieldFrame {Bounds=bounds};owner.Controls.Remove(this);owner.Controls.Add(frame);frame.Controls.Add(this);SetBounds(10,Math.Max(1,(frame.Height-PreferredHeight)/2),frame.Width-20,PreferredHeight);Anchor=AnchorStyles.Left|AnchorStyles.Right|AnchorStyles.Top;Enter+=(s,a)=>frame.Invalidate();Leave+=(s,a)=>frame.Invalidate();framing=false;}
    SpinOverlay spin;
    protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);if(spin==null){spin=new SpinOverlay(this);Controls.Add(spin);}StyleSpin();}
    void StyleSpin(){foreach(Control child in Controls)if(child.GetType().Name.Contains("UpDownButtons"))child.Visible=false;if(spin!=null){spin.SetBounds(Math.Max(0,ClientSize.Width-20),0,20,ClientSize.Height);spin.BringToFront();}}
    protected override void OnLayout(LayoutEventArgs e){base.OnLayout(e);StyleSpin();}
    // These buttons call the existing NumericUpDown operations and preserve its range/step rules.
    class SpinOverlay:Control {
      NumericUpDown owner;Timer repeat=new Timer {Interval=400};bool up;int hover;
      public SpinOverlay(NumericUpDown n){owner=n;DoubleBuffered=true;BackColor=Theme.Input;Cursor=Cursors.Hand;AccessibleRole=AccessibleRole.SpinButton;repeat.Tick+=(s,e)=>{repeat.Interval=70;Step();};}
      void Step(){if(owner.Enabled){if(up)owner.UpButton();else owner.DownButton();}}
      protected override void OnMouseDown(MouseEventArgs e){base.OnMouseDown(e);if(e.Button==MouseButtons.Left){up=e.Y<Height/2;owner.Focus();Step();repeat.Interval=400;repeat.Start();}}
      protected override void OnMouseUp(MouseEventArgs e){repeat.Stop();base.OnMouseUp(e);}protected override void OnMouseLeave(EventArgs e){repeat.Stop();hover=0;Invalidate();base.OnMouseLeave(e);}protected override void OnMouseMove(MouseEventArgs e){hover=e.Y<Height/2?1:2;Invalidate();base.OnMouseMove(e);}
      protected override void OnPaint(PaintEventArgs e){using(var background=new SolidBrush(Theme.Input))e.Graphics.FillRectangle(background,ClientRectangle);Theme.Icon(e.Graphics,"up",new Rectangle(2,0,16,Height/2),owner.Enabled?(hover==1?Theme.Purple:Theme.Muted):Theme.Edge);Theme.Icon(e.Graphics,"down",new Rectangle(2,Height/2,16,Height/2),owner.Enabled?(hover==2?Theme.Purple:Theme.Muted):Theme.Edge);}
      protected override void Dispose(bool disposing){if(disposing)repeat.Dispose();base.Dispose(disposing);}
    }
  }
  public class ModernTextBox:TextBox {
    public ModernTextBox(){BackColor=Theme.Input;ForeColor=Theme.Text;BorderStyle=BorderStyle.FixedSingle;Font=Theme.Font(11);}
  }
  public class StatusBadge:Label {
    Timer pulse=new Timer {Interval=80};float phase;bool animate;public bool Animate {get{return animate;}set{animate=value;if(value&&Visible&&Motion.Enabled)pulse.Start();else pulse.Stop();}}
    public StatusBadge(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);BackColor=Color.Transparent;pulse.Tick+=(s,e)=>{phase+=0.13f;Invalidate();};}
    protected override void OnVisibleChanged(EventArgs e){base.OnVisibleChanged(e);if(Visible&&Animate&&Motion.Enabled)pulse.Start();else pulse.Stop();}
    protected override void OnPaint(PaintEventArgs e){var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;Color ink=ForeColor;double amount=Animate?0.09+0.05*Math.Sin(phase):0.08;using(var p=Theme.Round(new Rectangle(0,0,Width-1,Height-1),Math.Min(10,Height/2)))using(var b=new SolidBrush(Motion.Blend(Theme.Surface,ink,amount)))g.FillPath(b,p);int cy=Height/2;using(var b=new SolidBrush(ink))g.FillEllipse(b,10,cy-3,6,6);TextRenderer.DrawText(g,Text.Replace("●","").Trim(),Font,new Rectangle(23,0,Width-30,Height),ink,TextFormatFlags.VerticalCenter|TextFormatFlags.EndEllipsis);}
    protected override void Dispose(bool disposing){if(disposing)pulse.Dispose();base.Dispose(disposing);}
  }
  // Borderless, resizable window with keyboard shortcuts and a native fallback on Windows 10.
  public class PremiumForm:Form {
    Panel chrome;Label caption;StatusBadge globalStatus;IconButton minimize,maximize,close;bool allowExit,layingOut,resizing;NotifyIcon tray;Icon brand;
    public bool KeepInTray;public bool PreviewMode;public bool ResizeWindow=true;
    public PremiumForm(){brand=CreateBrandIcon();Icon=brand;SetStyle(ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.ResizeRedraw,true);DoubleBuffered=true;FormBorderStyle=FormBorderStyle.None;BackColor=Theme.Bg;Padding=new Padding(8);KeyPreview=true;MinimumSize=new Size(640,500);MaximizedBounds=Screen.FromControl(this).WorkingArea;
      chrome=new Panel {Dock=DockStyle.Top,Height=52,BackColor=Theme.Chrome};caption=Theme.Label("POKEIDLE / GERENCIADOR",20,0,460,52,9,Theme.Muted,true);caption.TextAlign=ContentAlignment.MiddleLeft;chrome.Controls.Add(caption);globalStatus=new StatusBadge {Bounds=new Rectangle(470,12,145,28),Font=Theme.Font(8,true),ForeColor=Theme.Muted,Text="AGUARDANDO"};chrome.Controls.Add(globalStatus);
      minimize=new IconButton("","minimize"){Width=44,Height=34};maximize=new IconButton("","maximize"){Width=44,Height=34};close=new IconButton("","close"){Width=44,Height=34};close.Danger=true;minimize.Click+=(s,e)=>WindowState=FormWindowState.Minimized;maximize.Click+=(s,e)=>ToggleMaximize();close.Click+=(s,e)=>Close();chrome.Controls.AddRange(new Control[]{minimize,maximize,close});var tips=new ToolTip();tips.SetToolTip(minimize,"Minimizar");tips.SetToolTip(maximize,"Maximizar / restaurar");tips.SetToolTip(close,"Fechar janela");chrome.Disposed+=(s,e)=>tips.Dispose();
      chrome.MouseDown+=(s,e)=>{if(e.Button==MouseButtons.Left)DesktopNative.Drag(this);};caption.MouseDown+=(s,e)=>{if(e.Button==MouseButtons.Left)DesktopNative.Drag(this);};caption.DoubleClick+=(s,e)=>ToggleMaximize();chrome.DoubleClick+=(s,e)=>ToggleMaximize();Controls.Add(chrome);
      Resize+=(s,e)=>{LayoutChrome();if(!resizing)UpdateRound();};TextChanged+=(s,e)=>caption.Text=Text;FormClosing+=(s,e)=>{if(KeepInTray&&!PreviewMode&&!allowExit&&e.CloseReason==CloseReason.UserClosing){e.Cancel=true;Hide();}};
    }
    static Icon CreateBrandIcon(){using(var image=new Bitmap(32,32)){using(var g=Graphics.FromImage(image)){g.SmoothingMode=SmoothingMode.AntiAlias;using(var purple=new SolidBrush(Theme.Purple))g.FillEllipse(purple,2,2,28,28);using(var dark=new SolidBrush(Theme.Chrome))g.FillPie(dark,2,2,28,28,0,180);using(var line=new Pen(Theme.Text,2))g.DrawEllipse(line,2,2,28,28);using(var line=new Pen(Theme.Text,3))g.DrawLine(line,3,16,29,16);using(var white=new SolidBrush(Theme.Text))g.FillEllipse(white,11,11,10,10);using(var dark=new SolidBrush(Theme.Chrome))g.FillEllipse(dark,14,14,4,4);}IntPtr handle=image.GetHicon();try{return (Icon)Icon.FromHandle(handle).Clone();}finally{DesktopNative.DestroyIcon(handle);}}}
    void ToggleMaximize(){MaximizedBounds=Screen.FromControl(this).WorkingArea;if(MaximizeBox)WindowState=WindowState==FormWindowState.Maximized?FormWindowState.Normal:FormWindowState.Maximized;}
    void LayoutChrome(){if(chrome==null)return;close.Location=new Point(Math.Max(0,chrome.ClientSize.Width-54),9);maximize.Location=new Point(Math.Max(0,chrome.ClientSize.Width-102),9);minimize.Location=new Point(Math.Max(0,chrome.ClientSize.Width-(MaximizeBox?150:102)),9);maximize.Visible=MaximizeBox;minimize.Visible=MinimizeBox;caption.Width=Math.Max(150,Math.Min(410,ClientSize.Width-320));globalStatus.Left=caption.Right+12;globalStatus.Visible=KeepInTray&&ClientSize.Width>720;}
    protected override void OnLayout(LayoutEventArgs e){if(chrome!=null&&!layingOut&&Controls.GetChildIndex(chrome)!=Controls.Count-1){layingOut=true;Controls.SetChildIndex(chrome,Controls.Count-1);layingOut=false;}base.OnLayout(e);LayoutChrome();}
    protected override void OnResizeBegin(EventArgs e){resizing=true;var previous=Region;Region=null;if(previous!=null)previous.Dispose();base.OnResizeBegin(e);}
    protected override void OnResizeEnd(EventArgs e){resizing=false;UpdateRound();base.OnResizeEnd(e);}
    protected override void OnLoad(EventArgs e){
      // Absolute-positioned dialogs need their own content area below the custom title bar.
      var children=Controls.Cast<Control>().Where(c=>c!=chrome).ToArray();
      if(children.Length>0&&children.All(c=>c.Dock==DockStyle.None)){
        var body=new SmoothPanel {Dock=DockStyle.Fill,BackColor=BackColor,AutoScroll=true};
        SuspendLayout();ClientSize=new Size(ClientSize.Width,ClientSize.Height+chrome.Height);
        foreach(var child in children){Controls.Remove(child);body.Controls.Add(child);}
        Controls.Add(body);Controls.SetChildIndex(chrome,Controls.Count-1);ResumeLayout(true);
      }
      var area=Screen.FromControl(this).WorkingArea;
      // Respect small screens/high DPI instead of forcing a minimum larger than the monitor.
      MinimumSize=new Size(Math.Min(MinimumSize.Width,area.Width-24),Math.Min(MinimumSize.Height,area.Height-24));
      Size=new Size(Math.Min(Width,area.Width-24),Math.Min(Height,area.Height-24));
      base.OnLoad(e);
      Location=new Point(Math.Max(area.Left,Math.Min(Left,area.Right-Width)),Math.Max(area.Top,Math.Min(Top,area.Bottom-Height)));}
    protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);DesktopNative.RoundWindow(Handle);UpdateRound();}
    void UpdateRound(){if(!IsHandleCreated||Width<24||Height<24)return;Region previous=Region;if(WindowState==FormWindowState.Maximized)Region=null;else using(var p=Theme.Round(new Rectangle(0,0,Width,Height),12))Region=new Region(p);if(previous!=null)previous.Dispose();}
    protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);using(var pen=new Pen(Theme.Edge))using(var p=Theme.Round(new Rectangle(0,0,Width-1,Height-1),12))e.Graphics.DrawPath(pen,p);}
    protected override void WndProc(ref Message m){base.WndProc(ref m);if(m.Msg==0x84&&WindowState==FormWindowState.Normal&&ResizeWindow){var point=PointToClient(new Point(unchecked((short)(long)m.LParam),unchecked((short)((long)m.LParam>>16))));int hit=ResizeHit(point);if(hit!=0)m.Result=new IntPtr(hit);}}
    // Exposed to regression checks; uses the same hit zones as the native mouse message.
    public int ResizeHit(Point point){int margin=8;bool l=point.X<margin,r=point.X>=Width-margin,t=point.Y<margin,b=point.Y>=Height-margin;return t&&l?13:t&&r?14:b&&l?16:b&&r?17:l?10:r?11:t?12:b?15:0;}
    public void SetBotStatus(string state){globalStatus.Text=state;globalStatus.ForeColor=state=="ONLINE"?Theme.Green:state=="CONECTANDO"?Theme.Amber:Theme.Muted;globalStatus.Animate=state!="OFFLINE";globalStatus.Invalidate();}
    public void EnableTray(Action quit){KeepInTray=true;tray=new NotifyIcon {Text="PokeIdle Manager · Farm em segundo plano",Icon=brand,Visible=true};var menu=new ContextMenuStrip {BackColor=Theme.Surface,ForeColor=Theme.Text};menu.Items.Add("Abrir painel",null,(s,e)=>RestorePanel());menu.Items.Add("Encerrar bot",null,(s,e)=>quit());tray.ContextMenuStrip=menu;tray.DoubleClick+=(s,e)=>RestorePanel();}
    public void RestorePanel(){Show();WindowState=FormWindowState.Normal;Activate();BringToFront();}
    public void ExitUi(){allowExit=true;Close();}
    protected override void OnKeyDown(KeyEventArgs e){if(e.Alt&&e.KeyCode==Keys.F4){Close();e.Handled=true;}base.OnKeyDown(e);}
    protected override void Dispose(bool disposing){if(disposing&&tray!=null){tray.Visible=false;if(tray.ContextMenuStrip!=null)tray.ContextMenuStrip.Dispose();tray.Dispose();tray=null;}base.Dispose(disposing);if(disposing&&brand!=null){brand.Dispose();brand=null;}}
  }
  public class ConsoleLog:Panel {
    RichTextBox box;string signature="";public bool ShowAccount;
    public ConsoleLog(){DoubleBuffered=true;BackColor=Theme.Input;Padding=new Padding(12);box=new RichTextBox {Dock=DockStyle.Fill,ReadOnly=true,BorderStyle=BorderStyle.None,BackColor=Theme.Input,ForeColor=Theme.Muted,Font=new Font(Theme.LogFontFamily,9),WordWrap=true,DetectUrls=false};box.HandleCreated+=(s,e)=>{try{DesktopNative.SetWindowTheme(box.Handle,"DarkMode_Explorer",null);}catch{}};Controls.Add(box);}
    // Colors are presentation-only; server log entries and timestamps are never modified.
    public void UpdateEntries(IEnumerable<object> entries){var list=entries.Take(60).Reverse().ToList();string next=Data.Serializer.Serialize(list);if(next==signature)return;signature=next;bool follow=box.SelectionLength==0&&box.GetCharIndexFromPosition(new Point(box.ClientSize.Width-4,box.ClientSize.Height-4))>=Math.Max(0,box.TextLength-80);DesktopNative.SendMessage(box.Handle,0xB,IntPtr.Zero,IntPtr.Zero);try{box.Clear();foreach(var entry in list){string text=Data.S(entry,"text"),lower=text.ToLowerInvariant();Color color=Theme.Blue;string type="INFO";if(new[]{"falha","erro","bloquead","sem confirmação","recusad"}.Any(x=>lower.Contains(x))){type="ERRO";color=Theme.Red;}else if(new[]{"aguard","atenção","pausad","revis","desligad","desativad","removid"}.Any(x=>lower.Contains(x))){type="AVISO";color=Theme.Amber;}else if(new[]{"conectada","confirmad","salv","ativad","pronto"}.Any(x=>lower.Contains(x))){type="OK";color=Theme.Green;}box.SelectionColor=Theme.Muted;box.AppendText(Dashboard.Clock(Data.N(entry,"at"))+"  "+(ShowAccount?"[C"+Data.N(entry,"slot")+"]  ":""));box.SelectionColor=color;box.AppendText(type.PadRight(5)+"  ");box.SelectionColor=Theme.Text;box.AppendText(text.Replace('\r',' ').Replace('\n',' ')+Environment.NewLine);}if(list.Count==0)box.AppendText("Aguardando atividade desta conta…");if(follow){box.SelectionStart=box.TextLength;box.ScrollToCaret();}}finally{DesktopNative.SendMessage(box.Handle,0xB,new IntPtr(1),IntPtr.Zero);box.Invalidate();}}
  }
}
