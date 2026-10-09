using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.Linq;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace PokeidleDesktop {
  public static class Theme {
    // PERSONALIZE HERE: one palette and font family for every desktop component.
    public static string FontFamily="Segoe UI", LogFontFamily="Consolas";
    public static Color Chrome=Color.FromArgb(12,14,24), Input=Color.FromArgb(13,16,28), Blue=Color.FromArgb(111,187,255);
    public static Color Bg=Color.FromArgb(10,12,22), Surface=Color.FromArgb(22,25,42), Edge=Color.FromArgb(43,48,72), Text=Color.FromArgb(234,240,249), Muted=Color.FromArgb(146,160,180), Purple=Color.FromArgb(164,139,255), Green=Color.FromArgb(84,215,165), Amber=Color.FromArgb(255,195,108), Red=Color.FromArgb(255,108,120);
    static Dictionary<string,Font> fonts=new Dictionary<string,Font>();
    public static Font Font(float size=10, bool bold=false) { string key=size.ToString(CultureInfo.InvariantCulture)+":"+bold;Font f;if(!fonts.TryGetValue(key,out f)){f=new Font(FontFamily,size,bold?FontStyle.Bold:FontStyle.Regular);fonts[key]=f;}return f; }
    public static Label Label(string text,int x,int y,int w,int h,float size=10,Color? color=null,bool bold=false) { return new Label {Text=text,Bounds=new Rectangle(x,y,w,h),Font=Font(size,bold),ForeColor=color??Text,BackColor=Color.Transparent,AutoEllipsis=true}; }
    public static GraphicsPath Round(Rectangle r,int radius) {var p=new GraphicsPath();int d=radius*2;p.AddArc(r.X,r.Y,d,d,180,90);p.AddArc(r.Right-d,r.Y,d,d,270,90);p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.X,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
    public static void Fit(Label label,float maximum){float size=maximum;while(size>10&&(TextRenderer.MeasureText(label.Text,Font(size,true)).Width>label.Width||TextRenderer.MeasureText(label.Text,Font(size,true)).Height>label.Height))size-=0.5f;label.Font=Font(size,true);}
    public static string F(double n) { return n.ToString("N0",CultureInfo.GetCultureInfo("pt-BR")); }
    static Dictionary<string,string> glyphs=new Dictionary<string,string>{{"play","\uE768"},{"pause","\uE769"},{"coin","\uE8D4"},{"ball","\uE7FC"},{"potion","\uE95E"},{"live","\uE714"},{"browser","\uE774"},{"plus","\uE710"},{"minus","\uE738"},{"shield","\uEA18"},{"refresh","\uE72C"},{"minimize","\uE921"},{"maximize","\uE922"},{"close","\uE8BB"},{"up","\uE70E"},{"down","\uE70D"},{"menu","\uE700"}};
    public static void Icon(Graphics g,string name,Rectangle r,Color color){
      if(name=="ball"){
        // Vector Pokeball stays crisp at any DPI and does not depend on a font glyph.
        int d=Math.Min(r.Width,r.Height)-3;var circle=new Rectangle(r.X+(r.Width-d)/2,r.Y+(r.Height-d)/2,d,d);
        using(var pen=new Pen(color,Math.Max(1.4f,d/11f))){g.DrawEllipse(pen,circle);g.DrawLine(pen,circle.Left,circle.Top+d/2,circle.Right,circle.Top+d/2);}
        int center=Math.Max(5,d/3);var button=new Rectangle(circle.Left+(d-center)/2,circle.Top+(d-center)/2,center,center);
        using(var brush=new SolidBrush(Theme.Surface))g.FillEllipse(brush,button);using(var pen=new Pen(color,Math.Max(1.3f,d/13f)))g.DrawEllipse(pen,button);return;
      }
      string glyph;if(!glyphs.TryGetValue(name,out glyph))glyph="\uE9D9";using(var font=new Font("Segoe MDL2 Assets",Math.Max(8,r.Height*0.64f)))TextRenderer.DrawText(g,glyph,font,r,color,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.NoPadding);}
    public static Label Status(string text,int x,int y,int w,int h){return new StatusBadge {Text=text,Bounds=new Rectangle(x,y,w,h),Font=Font(8,true),ForeColor=Muted};}
    public static void StatusState(Label label,string state){var badge=label as StatusBadge;if(badge!=null)badge.Animate=state=="conectada"||state=="conectando"||state.Contains("reconexão");if(state=="conectando"||state.Contains("reconexão"))label.ForeColor=Amber;label.Invalidate();}
  }

  public class Card:Panel {
    public Card(){SetStyle(ControlStyles.AllPaintingInWmPaint|ControlStyles.UserPaint|ControlStyles.OptimizedDoubleBuffer,true);BackColor=Theme.Surface;Padding=new Padding(18);}
    protected override void OnPaintBackground(PaintEventArgs e){using(var background=new SolidBrush(Parent==null?Theme.Bg:Parent.BackColor))e.Graphics.FillRectangle(background,ClientRectangle);}
    protected override void OnPaint(PaintEventArgs e){e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(var p=Theme.Round(new Rectangle(0,0,Width-1,Height-1),16)){using(var b=new LinearGradientBrush(ClientRectangle,BackColor,Motion.Blend(BackColor,Theme.Bg,0.18),90f))e.Graphics.FillPath(b,p);using(var pen=new Pen(Theme.Edge))e.Graphics.DrawPath(pen,p);}base.OnPaint(e);}
  }
  public class DarkCombo:ComboBox {
    public DarkCombo(){DrawMode=DrawMode.OwnerDrawFixed;DropDownStyle=ComboBoxStyle.DropDownList;FlatStyle=FlatStyle.Flat;BackColor=Theme.Surface;ForeColor=Theme.Text;ItemHeight=24;}
    protected override void WndProc(ref Message m){base.WndProc(ref m);if((m.Msg==0xF||m.Msg==0x317||m.Msg==0x318)&&IsHandleCreated){using(var g=m.Msg!=0xF?Graphics.FromHdc(m.WParam):Graphics.FromHwnd(Handle)){using(var background=new SolidBrush(Parent==null?Theme.Surface:Parent.BackColor))g.FillRectangle(background,ClientRectangle);g.SmoothingMode=SmoothingMode.AntiAlias;using(var p=Theme.Round(new Rectangle(0,0,Width-1,Height-1),7)){using(var b=new SolidBrush(Theme.Input))g.FillPath(b,p);using(var pen=new Pen(Focused?Theme.Purple:Theme.Edge))g.DrawPath(pen,p);}TextRenderer.DrawText(g,SelectedIndex>=0?Convert.ToString(Items[SelectedIndex]):"Escolher item",Font,new Rectangle(12,0,Width-43,Height),Enabled?Theme.Text:Theme.Muted,TextFormatFlags.VerticalCenter|TextFormatFlags.EndEllipsis);Theme.Icon(g,"down",new Rectangle(Width-28,(Height-16)/2,16,16),Theme.Muted);}}}
    protected override void OnDrawItem(DrawItemEventArgs e){using(var b=new SolidBrush(Theme.Surface))e.Graphics.FillRectangle(b,e.Bounds);if(e.Index>=0)TextRenderer.DrawText(e.Graphics,Convert.ToString(Items[e.Index]),Font,e.Bounds,Enabled?Theme.Text:Theme.Muted,TextFormatFlags.VerticalCenter|TextFormatFlags.Left|TextFormatFlags.EndEllipsis);}
  }
  // Native Button contract, with a short hover transition; no game actions live here.
  public class IconButton:Button {
    public string Glyph="",Caption="";public bool Primary,Danger;bool hover,pressed;double transition;Timer animation=new Timer {Interval=16};
    public IconButton(string text,string icon,bool primary=false){Caption=text;Glyph=icon;Primary=primary;FlatStyle=FlatStyle.Flat;FlatAppearance.BorderSize=0;Cursor=Cursors.Hand;Font=Theme.Font(9.5f,true);Height=42;Width=160;BackColor=Theme.Surface;ForeColor=Theme.Text;AccessibleName=text;SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);animation.Tick+=(s,e)=>{double target=hover?1:0;transition+=(target-transition)*0.24;if(Math.Abs(transition-target)<0.015){transition=target;animation.Stop();}Invalidate();};}
    void Animate(){if(Motion.Enabled)animation.Start();else{transition=hover?1:0;Invalidate();}}
    protected override void OnMouseEnter(EventArgs e){hover=true;Animate();base.OnMouseEnter(e);}protected override void OnMouseLeave(EventArgs e){hover=false;pressed=false;Animate();base.OnMouseLeave(e);}
    protected override void OnMouseDown(MouseEventArgs e){pressed=true;Invalidate();base.OnMouseDown(e);}protected override void OnMouseUp(MouseEventArgs e){pressed=false;Invalidate();base.OnMouseUp(e);}
    protected override void OnPaintBackground(PaintEventArgs e){using(var background=new SolidBrush(Parent==null?Theme.Bg:Parent.BackColor))e.Graphics.FillRectangle(background,ClientRectangle);}
    protected override void OnPaint(PaintEventArgs e){OnPaintBackground(e);var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;Color normal=Primary?Theme.Purple:Theme.Surface;Color target=Danger?Theme.Red:Primary?Motion.Blend(Theme.Purple,Theme.Text,0.18):Motion.Blend(Theme.Surface,Theme.Purple,0.14);Color bg=Motion.Blend(normal,target,transition);if(pressed)bg=Motion.Blend(bg,Theme.Bg,0.2);if(!Enabled)bg=Theme.Input;using(var p=Theme.Round(new Rectangle(0,0,Width-1,Height-1),10)){using(var b=new SolidBrush(bg))g.FillPath(b,p);using(var pen=new Pen(Primary?bg:hover?Motion.Blend(Theme.Edge,Theme.Purple,transition):Theme.Edge))g.DrawPath(pen,p);}Color fg=Enabled?(Primary?Theme.Bg:Theme.Text):Theme.Muted;Theme.Icon(g,Glyph,new Rectangle(Caption==""?(Width-20)/2:14,(Height-20)/2,20,20),fg);if(Caption!="")TextRenderer.DrawText(g,Caption,Font,new Rectangle(42,0,Width-49,Height),fg,TextFormatFlags.VerticalCenter|TextFormatFlags.Left|TextFormatFlags.EndEllipsis);if(Focused&&ShowFocusCues&&Caption!="")ControlPaint.DrawFocusRectangle(g,new Rectangle(4,4,Width-8,Height-8),fg,bg);}
    protected override void Dispose(bool disposing){if(disposing)animation.Dispose();base.Dispose(disposing);}
  }
  public class CommandEvent:EventArgs {public string Action;public int Slot;public string Json;}
  public static class Data {
    public static JavaScriptSerializer Serializer=new JavaScriptSerializer {MaxJsonLength=16777216};
    public static Dictionary<string,object> Map(object o){return o as Dictionary<string,object>??new Dictionary<string,object>();}
    public static object Get(object o,string k){object v;return Map(o).TryGetValue(k,out v)?v:null;}
    public static string S(object o,string k,string fallback=""){object v=Get(o,k);return v==null?fallback:Convert.ToString(v);}
    public static double N(object o,string k,double fallback=0){object v=Get(o,k);double n;return v!=null&&double.TryParse(Convert.ToString(v,CultureInfo.InvariantCulture),NumberStyles.Any,CultureInfo.InvariantCulture,out n)?n:fallback;}
    public static bool B(object o,string k){return Get(o,k) is bool&&(bool)Get(o,k);}
    public static IEnumerable<object> List(object o){return (o as IEnumerable<object>)??new object[0];}
    public static double Stock(object a,object item){return N(Get(a,S(item,"kind")=="ball"?"balls":"items"),S(item,"id"));}
    // Shortcuts use the existing Depot eligibility and server-side sale checks.
    public static bool CanSell(object account){var depot=Get(account,"depot");var guard=Get(account,"saleGuard");return S(account,"status")=="conectada"&&B(depot,"known")&&List(Get(depot,"eligible")).Any()&&Get(guard,"pending")==null&&S(guard,"fault")=="";}
    public static string Group(object i){return S(i,"kind")=="ball"?"Pokébolas":S(i,"category")=="revive"?"Revives":"Poções";}
    public static string Status(object a){var s=S(a,"status");if(s=="conectada")return B(a,"inCenter")?"No Centro Pokémon":S(a,"hunt")==""?"Conectada, sem hunt":"Farm em andamento";if(s=="conectando")return "Conectando…";if(s.Contains("outra sessão"))return "Aberta no jogo";if(s.Contains("reconexão"))return "Reconectando…";if(s=="não importada")return "Adicionar conta";return s.StartsWith("pausada")?"Precisa de atenção":"Parada";}
  }
  public class ProgressMeter:Control {
    public string Caption="";public double Percent;public Color Accent=Theme.Purple;
    public ProgressMeter(){DoubleBuffered=true;Height=25;BackColor=Theme.Surface;Font=Theme.Font(9);}
    protected override void OnPaint(PaintEventArgs e){using(var bg=new SolidBrush(Theme.Bg))using(var fill=new SolidBrush(Accent)){e.Graphics.FillRectangle(bg,0,20,Width,4);e.Graphics.FillRectangle(fill,0,20,(int)(Width*Math.Max(0,Math.Min(100,Percent))/100),4);}TextRenderer.DrawText(e.Graphics,Caption,Font,new Rectangle(0,0,Width,18),Theme.Muted,TextFormatFlags.EndEllipsis);}
  }
  // Presentation-only item tile: full quantities, category color, no embedded scrollbar.
  public class SupplyTile:Control {
    public string ItemName,Glyph;public double Quantity;public Color Accent;
    public SupplyTile(string name,string glyph,double quantity,Color accent){ItemName=name;Glyph=glyph;Quantity=quantity;Accent=accent;DoubleBuffered=true;Height=48;BackColor=Theme.Surface;AccessibleName=name+": "+Theme.F(quantity);}
    protected override void OnPaint(PaintEventArgs e){var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;
      using(var background=new SolidBrush(BackColor))g.FillRectangle(background,ClientRectangle);
      using(var path=Theme.Round(new Rectangle(0,0,Width-1,Height-1),8)){
        using(var fill=new SolidBrush(Motion.Blend(Theme.Input,Accent,0.08)))g.FillPath(fill,path);
        using(var line=new Pen(Motion.Blend(Theme.Edge,Accent,0.32)))g.DrawPath(line,path);
      }
      Theme.Icon(g,Glyph,new Rectangle(8,7,16,16),Accent);
      TextRenderer.DrawText(g,ItemName,Theme.Font(8),new Rectangle(29,5,Width-36,17),Theme.Muted,TextFormatFlags.EndEllipsis|TextFormatFlags.VerticalCenter|TextFormatFlags.NoPadding);
      string amount=Theme.F(Quantity);float size=12;while(size>8&&TextRenderer.MeasureText(amount,Theme.Font(size,true)).Width>Width-18)size-=0.5f;
      TextRenderer.DrawText(g,amount,Theme.Font(size,true),new Rectangle(9,24,Width-18,20),Quantity<=0?Theme.Red:Accent,TextFormatFlags.VerticalCenter|TextFormatFlags.NoPadding);
    }
  }
}
