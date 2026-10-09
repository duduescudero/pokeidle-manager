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
  public class FleetCard:Card {
    Label title,status,hunt,coins,currency,pokemon,combat,stock,bonuses,last;ProgressMeter trainer,xp,hp;Label[] rates=new Label[3],captions=new Label[3];SmoothPanel supplies;Label suppliesTitle,suppliesHint;string suppliesKey="";public bool CompactMode;IconButton compactConnect;IconButton run,view,sell,browser;public event EventHandler<CommandEvent> Command;int slot;object account;Panel empty;ToolTip tips=new ToolTip();
    public FleetCard(int number){slot=number;Width=442;Height=460;
      title=Theme.Label("Conta "+slot,20,18,250,30,15,Theme.Text,true);status=Theme.Status("LIVRE",280,20,140,28);status.TextAlign=ContentAlignment.MiddleRight;
      hunt=Theme.Label("",20,51,400,23,10,Theme.Muted);coins=Theme.Label("—",20,86,400,45,26,Theme.Amber,true);currency=Theme.Label("COINS",20,132,400,23,9,Theme.Muted);
      trainer=new ProgressMeter {Top=170};pokemon=Theme.Label("",20,204,400,28,12,Theme.Text,true);xp=new ProgressMeter {Top=238};hp=new ProgressMeter {Top=238,Accent=Theme.Green};
      Controls.AddRange(new Control[]{title,status,hunt,coins,currency,trainer,pokemon,xp,hp});
      string[] names={"XP CONTA / H","XP POKÉMON / H","LUCRO EST. / H"};for(int i=0;i<3;i++){captions[i]=Theme.Label(names[i],0,285,120,21,8,Theme.Muted,true);rates[i]=Theme.Label("—",0,307,120,30,17,i==2?Theme.Amber:Theme.Purple,true);Controls.Add(captions[i]);Controls.Add(rates[i]);}Controls.Add(Theme.Label("MÉDIAS DESTA SESSÃO",20,224,350,14,7,Theme.Muted));
      combat=Theme.Label("",20,341,400,33,9,Theme.Text);stock=Theme.Label("",20,374,400,23,9,Theme.Muted);bonuses=Theme.Label("",20,401,400,23,9,Theme.Purple);last=Theme.Label("",20,492,400,23,9,Theme.Muted);Controls.AddRange(new Control[]{combat,stock,bonuses,last});
      suppliesTitle=Theme.Label("SUPRIMENTOS",20,383,400,18,8,Theme.Muted,true);
      supplies=new SmoothPanel {BackColor=Theme.Surface,AutoScroll=false};suppliesHint=Theme.Label("Aguardando estoque do jogo.",0,0,380,32,9,Theme.Muted);supplies.Controls.Add(suppliesHint);
      Controls.AddRange(new Control[]{suppliesTitle,supplies});
      view=new IconButton("Detalhes","ball"){Top=438,Height=40};run=new IconButton("Iniciar farm","play",true){Top=438,Height=40};view.Click+=(o,e)=>Emit("view");run.Click+=(o,e)=>Emit(Data.S(account,"status")=="conectada"?"stop":"start");sell=new IconButton("Vender Depot","coin"){Height=32};sell.Click+=(o,e)=>Emit("depot-shortcut");compactConnect=new IconButton("Conectar conta","plus",true);compactConnect.Click+=(o,e)=>Emit("import");Controls.AddRange(new Control[]{view,run,sell,compactConnect});compactConnect.Visible=false;Height=480;
      empty=new SmoothPanel {BackColor=Theme.Surface};empty.Paint+=(o,e)=>Theme.Icon(e.Graphics,"ball",new Rectangle((empty.Width-44)/2,48,44,44),Theme.Purple);
      browser=new IconButton("Abrir conta","browser"){Height=32,AccessibleName="Abrir conta no navegador"};browser.Click+=(o,e)=>Emit("browser-open");Controls.Add(browser);tips.SetToolTip(browser,"Abrir esta conta logada no navegador, em janela anônima isolada. Pausa o farm desta conta.");
      var heading=Theme.Label("Mais uma conta",0,119,400,40,19,Theme.Text,true);heading.TextAlign=ContentAlignment.MiddleCenter;empty.Controls.Add(heading);
      var help=Theme.Label("Conecte para acompanhar seu farm aqui.",0,174,400,60,11,Theme.Muted);help.TextAlign=ContentAlignment.MiddleCenter;empty.Controls.Add(help);
      var connect=new IconButton("Conectar conta","plus",true){Top=254,Width=240};connect.Click+=(o,e)=>Emit("import");empty.Controls.Add(connect);Controls.Add(empty);empty.BringToFront();Resize+=(o,e)=>Arrange();Arrange();
    }
    public void Arrange(){
      if(CompactMode){bool imported=Data.B(account,"imported");foreach(Control child in Controls)child.Visible=imported&&(child==view||child==run||child==sell||child==browser);compactConnect.Visible=!imported;
        int saleWidth=Width>=370?Math.Max(136,(int)((Width-74)*0.4)):(Width-74)/3;int smallButtonWidth=(Width-74-saleWidth)/2;int top=Height-38;view.SetBounds(10,top,smallButtonWidth,28);run.SetBounds(16+smallButtonWidth,top,smallButtonWidth,28);sell.SetBounds(22+smallButtonWidth*2,top,saleWidth,28);browser.SetBounds(Width-42,top,32,28);browser.Caption="";
        view.Caption=smallButtonWidth<130?"":"Detalhes";run.Caption=smallButtonWidth<130?"":Data.S(account,"status")=="conectada"?"Pausar":"Iniciar";sell.Caption=saleWidth<150?"":"Vender Depot";
        compactConnect.SetBounds(12,Height-46,Width-24,32);Invalidate();return;
      }
      foreach(Control child in Controls)child.Visible=Data.B(account,"imported")&&child!=empty&&child!=compactConnect;title.Visible=status.Visible=true;empty.Visible=!Data.B(account,"imported");view.Caption="Detalhes";sell.Caption="Vender Depot";browser.Caption="Abrir conta";run.Caption=Data.S(account,"status")=="conectada"?"Pausar farm":"Iniciar farm";
      int w=Width-40;title.Top=14;title.Height=27;title.Width=Math.Max(100,w-125);status.SetBounds(Width-150,20,130,25);foreach(var label in new[]{hunt,coins,currency,pokemon,combat,stock,bonuses,last})label.Width=w;hunt.Top=43;coins.SetBounds(20,69,w,36);currency.Top=109;pokemon.Top=164;combat.Top=296;stock.Top=332;bonuses.Top=354;last.SetBounds(20,458,w,16);last.Font=Theme.Font(8);
      trainer.SetBounds(20,134,w,25);int pw=(w-18)*3/5;xp.SetBounds(20,196,pw,25);hp.SetBounds(38+pw,196,w-pw-18,25);
      int rw=(w-20)/3;for(int i=0;i<3;i++){captions[i].SetBounds(20+i*(rw+10),240,rw,21);rates[i].SetBounds(20+i*(rw+10),262,rw,30);rates[i].Font=Theme.Font(rw<125?14:17,true);}
      suppliesTitle.Width=w;suppliesTitle.Top=383;int supplyHeight=LayoutSupplies(w);supplies.SetBounds(20,405,w,supplyHeight);
      int actionTop=supplies.Bottom+12;int bw=(w-12)/2;view.SetBounds(20,actionTop,bw,34);run.SetBounds(32+bw,actionTop,w-bw-12,34);sell.SetBounds(20,actionTop+41,bw,30);browser.SetBounds(32+bw,actionTop+41,w-bw-12,30);last.Top=actionTop+75;empty.SetBounds(18,64,Width-36,Height-84);foreach(Control c in empty.Controls){if(c is Label)c.Width=empty.Width;else c.Left=(empty.Width-c.Width)/2;}Theme.Fit(coins,w<390?22:24);}
    int SupplyColumns(int width){return width>=350?3:2;}
    int LayoutSupplies(int width){var tiles=supplies.Controls.OfType<SupplyTile>().ToArray();if(tiles.Length==0){suppliesHint.Width=width;return 32;}
      int cols=SupplyColumns(width),tw=(width-(cols-1)*8)/cols;for(int i=0;i<tiles.Length;i++)tiles[i].SetBounds((i%cols)*(tw+8),(i/cols)*56,tw,48);
      return ((tiles.Length+cols-1)/cols)*56-8;
    }
    public int PreferredCardHeight(int width){if(!Data.B(account,"imported"))return 480;return 480+LayoutSupplies(Math.Max(100,width-40))+34;}
    void UpdateSupplies(object data){var configured=Data.List(Data.Get(Data.Get(data,"config"),"rules")).ToList();
      var items=Data.List(Data.Get(data,"catalog")).Where(i=>Data.Stock(data,i)>0||configured.Any(r=>Data.S(r,"kind")==Data.S(i,"kind")&&Data.N(r,"id")==Data.N(i,"id"))).GroupBy(i=>Data.S(i,"kind")+":"+Data.S(i,"id")).Select(g=>g.First()).ToList();
      string key=Data.S(data,"status")+":"+String.Join("|",items.Select(i=>Data.S(i,"kind")+":"+Data.S(i,"id")+":"+Data.S(i,"name")+":"+Data.Stock(data,i)));
      if(key==suppliesKey)return;suppliesKey=key;supplies.SuspendLayout();
      foreach(var tile in supplies.Controls.OfType<SupplyTile>().ToArray())tile.Dispose();
      suppliesHint.Visible=items.Count==0;suppliesHint.Text=Data.Get(data,"gold")==null||Data.Get(data,"balls")==null&&Data.Get(data,"items")==null?"Aguardando estoque do jogo.":"Sem suprimentos em estoque.";
      foreach(var item in items){bool ball=Data.S(item,"kind")=="ball",revive=Data.S(item,"category")=="revive";var tile=new SupplyTile(Data.S(item,"name"),ball?"ball":revive?"refresh":"potion",Data.Stock(data,item),ball?Theme.Purple:revive?Theme.Blue:Theme.Green);supplies.Controls.Add(tile);tips.SetToolTip(tile,Data.S(item,"name")+": "+Theme.F(Data.Stock(data,item))+" unidades"+(Data.S(data,"status")=="conectada"?"":" · última leitura"));}
      suppliesTitle.Text=Data.S(data,"status")=="conectada"?"SUPRIMENTOS":"SUPRIMENTOS · ÚLTIMA LEITURA";supplies.ResumeLayout();
    }
    protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);if(CompactMode){PaintCompact(e.Graphics);return;}using(var pen=new Pen(Data.S(account,"status")=="conectada"?Theme.Green:Theme.Edge,2))e.Graphics.DrawLine(pen,20,3,Width-20,3);using(var pen=new Pen(Theme.Edge))e.Graphics.DrawLine(pen,20,238,Width-20,238);}
    void SmallText(Graphics g,string value,int y,int height,float size,Color color,bool bold=false){TextRenderer.DrawText(g,value,Theme.Font(size,bold),new Rectangle(12,y,Width-24,height),color,TextFormatFlags.VerticalCenter|TextFormatFlags.EndEllipsis|TextFormatFlags.NoPadding);}
    void CompactMeter(Graphics g,int x,int y,int width,string caption,double percent,Color color,bool tiny){
      TextRenderer.DrawText(g,caption,Theme.Font(tiny?7:8),new Rectangle(x,y,width,tiny?12:17),Theme.Muted,TextFormatFlags.EndEllipsis|TextFormatFlags.VerticalCenter|TextFormatFlags.NoPadding);
      var track=new Rectangle(x,y+(tiny?13:18),width,tiny?3:4);using(var background=new SolidBrush(Theme.Bg))g.FillRectangle(background,track);
      using(var fill=new SolidBrush(color))g.FillRectangle(fill,new Rectangle(track.X,track.Y,(int)(track.Width*Math.Max(0,Math.Min(100,percent))/100),track.Height));
    }
    string RateText(object metrics,string key){return Data.Get(metrics,key)==null?"—":Compact(Data.N(metrics,key));}
    void PaintCompact(Graphics g){bool imported=Data.B(account,"imported"),live=Data.S(account,"status")=="conectada";Color state=Data.B(Data.Get(account,"browser"),"active")?Theme.Blue:live?Theme.Green:Data.S(account,"status")=="conectando"?Theme.Amber:Theme.Muted;
      using(var dot=new SolidBrush(state))g.FillEllipse(dot,Width-22,14,7,7);
      TextRenderer.DrawText(g,Data.S(account,"nick","Conta "+slot),Theme.Font(Width<300?10:12,true),new Rectangle(12,8,Width-40,24),Theme.Text,TextFormatFlags.VerticalCenter|TextFormatFlags.EndEllipsis|TextFormatFlags.NoPadding);
      if(!imported){SmallText(g,"Conta disponível",40,22,9,Theme.Muted);if(Height>210)Theme.Icon(g,"ball",new Rectangle((Width-36)/2,80,36,36),Theme.Purple);return;}
      bool tiny=Height<220;var metrics=Data.Get(account,"metrics");var pk=Data.Get(account,"activePokemon");var tx=Data.Get(account,"trainerXp");var px=Data.Get(pk,"xp");double hpPercent=Data.N(pk,"maxHp")>0?100*Data.N(pk,"hp")/Data.N(pk,"maxHp"):0;int w=Width-24,y=32,bottom=Height-44;
      if(!tiny){SmallText(g,Data.B(account,"inCenter")?"No Centro Pokémon":Data.S(account,"hunt","Sem hunt").Replace('_',' '),y,17,8,Theme.Muted);y+=18;}
      SmallText(g,Number(account,"gold")+" Coins"+(live?"":" · última leitura"),y,tiny?20:26,tiny?12:17,Theme.Amber,true);y+=tiny?21:28;
      string trainerCaption="Conta · Nv "+Number(account,"trainerLevel")+" · "+(tx==null?"—":Data.N(tx,"percent").ToString("0.0",CultureInfo.GetCultureInfo("pt-BR"))+"%");
      CompactMeter(g,12,y,w,trainerCaption,Data.N(tx,"percent"),Theme.Purple,tiny);y+=tiny?19:27;
      int pw=(w-10)*2/3;string pokemonCaption=Data.S(pk,"name","Pokémon")+" · Nv "+Number(pk,"level")+" · "+(px==null?"—":Data.N(px,"percent").ToString("0.0",CultureInfo.GetCultureInfo("pt-BR"))+"%");
      CompactMeter(g,12,y,pw,pokemonCaption,Data.N(px,"percent"),Theme.Purple,tiny);CompactMeter(g,22+pw,y,w-pw-10,"HP "+Number(pk,"hp")+"/"+Number(pk,"maxHp"),hpPercent,hpPercent<35?Theme.Amber:Theme.Green,tiny);y+=tiny?19:27;
      if(tiny){SmallText(g,"Capt. "+Number(metrics,"catches")+" · Shiny "+Number(metrics,"shinySeen")+" vistos / "+Number(metrics,"shinyCaught")+" pegos",y,13,7,Theme.Purple);y+=15;}
      else {SmallText(g,Number(metrics,"kills")+" abates · "+Number(metrics,"catches")+" capturas",y,17,9,Theme.Text);y+=18;SmallText(g,"★ Shiny vistos "+Number(metrics,"shinySeen")+" · Capturados "+Number(metrics,"shinyCaught"),y,17,8,Theme.Purple);y+=20;}
      if(!tiny&&bottom-y>=70){int col=(w-12)/3;string[] labels={"XP CONTA / H","XP POKÉMON / H","LUCRO EST. / H"};string[] keys={"trainerHour","pokemonHour","netHour"};for(int i=0;i<3;i++){int x=12+i*(col+6);TextRenderer.DrawText(g,labels[i],Theme.Font(7,true),new Rectangle(x,y,col,13),Theme.Muted,TextFormatFlags.EndEllipsis|TextFormatFlags.NoPadding);TextRenderer.DrawText(g,RateText(metrics,keys[i]),Theme.Font(12,true),new Rectangle(x,y+15,col,22),i==2?(Data.N(metrics,"netHour")<0?Theme.Red:Theme.Amber):Theme.Purple,TextFormatFlags.EndEllipsis|TextFormatFlags.NoPadding);}y+=41;}
      if(!tiny&&bottom-y>=44){SmallText(g,stock.Text,y,17,8,Theme.Muted);y+=18;SmallText(g,bonuses.Text,y,17,8,Theme.Purple);y+=20;}
      var tiles=supplies.Controls.OfType<SupplyTile>().ToArray();
      if(bottom-y>=26&&tiles.Length>0){bool named=Width>=430&&bottom-y>=80;int step=named?42:28,cols=Width>=400?4:3,rows=Math.Max(1,(bottom-y)/step),limit=Math.Min(tiles.Length,rows*cols);int tw=(w-(cols-1)*6)/cols;for(int i=0;i<limit;i++){var tile=tiles[i];var rect=new Rectangle(12+(i%cols)*(tw+6),y+(i/cols)*step,tw,named?36:23);using(var path=Theme.Round(rect,5))using(var fill=new SolidBrush(Motion.Blend(Theme.Input,tile.Accent,0.12)))g.FillPath(fill,path);Theme.Icon(g,tile.Glyph,new Rectangle(rect.X+4,rect.Y+4,14,14),tile.Accent);if(named)TextRenderer.DrawText(g,tile.ItemName,Theme.Font(7),new Rectangle(rect.X+23,rect.Y+2,tw-26,15),Theme.Muted,TextFormatFlags.VerticalCenter|TextFormatFlags.EndEllipsis|TextFormatFlags.NoPadding);TextRenderer.DrawText(g,Theme.F(tile.Quantity),Theme.Font(named?9:8,true),new Rectangle(rect.X+(named?8:23),rect.Y+(named?17:0),tw-(named?16:26),named?17:23),tile.Quantity==0?Theme.Red:tile.Accent,TextFormatFlags.VerticalCenter|TextFormatFlags.EndEllipsis|TextFormatFlags.NoPadding);}}
    }
    void Emit(string action){if(Command!=null)Command(this,new CommandEvent {Action=action,Slot=slot});}
    static string Number(object a,string key){return Data.Get(a,key)==null?"—":Theme.F(Data.N(a,key));}
    static string Compact(double n){if(n<0)return "−"+Compact(-n);return n>=1000000000?(n/1000000000).ToString("0.##",CultureInfo.GetCultureInfo("pt-BR"))+" bi":n>=1000000?(n/1000000).ToString("0.##",CultureInfo.GetCultureInfo("pt-BR"))+" mi":n>=10000?(n/1000).ToString("0.#",CultureInfo.GetCultureInfo("pt-BR"))+" mil":Theme.F(n);}
    void Rate(int i,object m,string key){rates[i].Text=Data.Get(m,key)==null?"—":Compact(Data.N(m,key));tips.SetToolTip(rates[i],Data.Get(m,key)==null?"Disponível após um minuto de farm":Theme.F(Data.N(m,key))+" por hora · média desta sessão do bot");}
    static void Progress(ProgressMeter bar,object value,string caption){bar.Caption=caption+(value==null?" · aguardando":" · "+Data.N(value,"percent").ToString("0.0",CultureInfo.GetCultureInfo("pt-BR"))+"%");bar.Percent=Data.N(value,"percent");bar.Invalidate();}
    public void Update(object a,string latest){account=a;UpdateSupplies(a);tips.SetToolTip(this,Data.Status(a)+"\n"+String.Join("\n",supplies.Controls.OfType<SupplyTile>().Select(t=>t.ItemName+": "+Theme.F(t.Quantity))));tips.SetToolTip(view,"Ver detalhes da conta");tips.SetToolTip(run,Data.S(a,"status")=="conectada"?"Pausar farm":"Iniciar farm");tips.SetToolTip(sell,"Vender Depot desta conta");bool imported=Data.B(a,"imported");empty.Visible=!imported;foreach(Control c in Controls)if(c!=title&&c!=status&&c!=empty)c.Visible=imported;bool live=Data.S(a,"status")=="conectada";
      title.Text=Data.S(a,"nick","Conta "+slot);status.Text=Data.B(Data.Get(a,"browser"),"active")?"● NAVEGADOR":live?"● ONLINE":!imported?"LIVRE":"● "+Data.Status(a).ToUpperInvariant();status.ForeColor=Data.B(Data.Get(a,"browser"),"active")?Theme.Blue:live?Theme.Green:Theme.Muted;Theme.StatusState(status,Data.S(a,"status"));hunt.Text=Data.B(a,"inCenter")?"No Centro Pokémon":Data.S(a,"hunt","Sem hunt informada").Replace('_',' ');coins.Text=Number(a,"gold");currency.Text="COINS  ·  Diamantes "+Number(a,"diamonds")+"  ·  Gemas "+Number(a,"gems");
      Progress(trainer,Data.Get(a,"trainerXp"),"Conta · Nv "+Number(a,"trainerLevel"));var pk=Data.Get(a,"activePokemon");pokemon.Text=pk==null?"Nenhum Pokémon em campo":(Data.B(pk,"shiny")?"★ ":"")+Data.S(pk,"name")+" · Nv "+Number(pk,"level");Progress(xp,Data.Get(pk,"xp"),"XP Pokémon");hp.Caption="HP "+Number(pk,"hp")+" / "+Number(pk,"maxHp");hp.Percent=Data.N(pk,"maxHp")>0?100*Data.N(pk,"hp")/Data.N(pk,"maxHp"):0;hp.Accent=hp.Percent<35?Theme.Amber:Theme.Green;hp.Invalidate();
      var m=Data.Get(a,"metrics");Rate(0,m,"trainerHour");Rate(1,m,"pokemonHour");Rate(2,m,"netHour");rates[2].ForeColor=Data.N(m,"netHour")<0?Theme.Red:Theme.Amber;combat.Text=Number(m,"kills")+" abates  ·  "+Number(m,"catches")+" capturas\n★ Shiny vistos: "+Number(m,"shinySeen")+"  ·  Capturados: "+Number(m,"shinyCaught");
      stock.Text="Depot: "+Number(Data.Get(a,"depot"),"count")+" Pokémon  ·  Compras "+(Data.B(Data.Get(a,"config"),"enabled")?"ligadas":"desligadas");var tw=Data.Get(a,"twitch");var activeBonus=Data.List(Data.Get(a,"bonuses")).Where(i=>Data.S(i,"text").Contains("+")).Select(i=>Data.S(i,"name"));bonuses.Text=(Data.B(tw,"active")?"Twitch +"+Data.N(tw,"percent")+"% XP":"Twitch sem bônus")+(activeBonus.Any()?"  ·  "+String.Join(" · ",activeBonus):"");tips.SetToolTip(bonuses,String.Join(" · ",Data.List(Data.Get(a,"bonuses")).Select(i=>Data.S(i,"name")+": "+Data.S(i,"text"))));
      long secs=(long)Data.N(m,"uptimeMs")/1000;last.Text=(live?"Tempo da sessão ":"Última leitura · ")+String.Format("{0:00}:{1:00}:{2:00}",secs/3600,secs/60%60,secs%60);sell.Enabled=Data.CanSell(account);run.Enabled=imported&&!Data.B(Data.Get(a,"browser"),"active");browser.Enabled=imported&&!Data.B(Data.Get(a,"browser"),"opening");run.Caption=live?"Pausar farm":"Iniciar farm";run.Primary=!live;run.Invalidate();Arrange();Invalidate();}
  }
}
