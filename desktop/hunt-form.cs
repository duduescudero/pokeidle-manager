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
  public class HuntForm:PremiumForm {
    public string ResultJson;public event EventHandler<CommandEvent> Command;public int Slot;object account,advice;List<object> hunts;ListBox list;ModernTextBox search;Label description,autoStatus,profile;IconButton choose,recommended,all,autoBest,cancelQueued;bool showingRecommended;
    public HuntForm(string json){account=Data.Serializer.DeserializeObject(json);advice=Data.Get(account,"huntAdvice");hunts=Data.List(Data.Get(account,"hunts")).ToList();showingRecommended=Data.B(advice,"available")&&Data.List(Data.Get(advice,"recommended")).Any();Text="Rotas de farm · "+Data.S(account,"nick");ClientSize=new Size(760,660);MinimumSize=new Size(640,560);StartPosition=FormStartPosition.CenterParent;Font=Theme.Font();MinimizeBox=false;
      var body=new SmoothPanel {Dock=DockStyle.Fill,Padding=new Padding(20)};Controls.Add(body);
      var heading=Theme.Label("Onde seu Pokémon pode render mais",20,14,700,34,19,Theme.Text,true);body.Controls.Add(heading);
      profile=Theme.Label("",20,53,700,34,9,Theme.Muted);body.Controls.Add(profile);
      Slot=(int)Data.N(account,"slot");autoBest=new IconButton("Auto melhor hunt · desligado","refresh"){Bounds=new Rectangle(20,94,285,32)};autoBest.Click+=(s,e)=>{if(Command!=null)Command(this,new CommandEvent{Slot=Slot,Action="hunt-auto",Json=Data.Serializer.Serialize(new Dictionary<string,object>{{"enabled",!Data.B(Data.Get(account,"autoHunt"),"enabled")}})});};body.Controls.Add(autoBest);
      autoStatus=Theme.Label("",317,94,403,32,8.5f,Theme.Muted);body.Controls.Add(autoStatus);
      cancelQueued=new IconButton("","close"){Bounds=new Rectangle(688,94,32,32),Visible=false,AccessibleName="Cancelar troca agendada"};cancelQueued.Click+=(s,e)=>{if(Command!=null)Command(this,new CommandEvent{Slot=Slot,Action="hunt-cancel"});};body.Controls.Add(cancelQueued);var cancelTip=new ToolTip();cancelTip.SetToolTip(cancelQueued,"Cancelar troca manual agendada");FormClosed+=(s,e)=>cancelTip.Dispose();
      recommended=new IconButton("Recomendadas · XP","shield"){Bounds=new Rectangle(20,94,260,32),Enabled=Data.B(advice,"available")};recommended.Click+=(s,e)=>{showingRecommended=true;Fill();};
      all=new IconButton("Todas as hunts","menu"){Bounds=new Rectangle(292,94,260,32)};all.Click+=(s,e)=>{showingRecommended=false;Fill();};body.Controls.AddRange(new Control[]{recommended,all});
      var searchLabel=Theme.Label("Buscar hunt por nome",20,136,700,21,9,Theme.Muted);body.Controls.Add(searchLabel);
      search=new ModernTextBox {Bounds=new Rectangle(20,160,700,26)};search.AccessibleName="Buscar hunt por nome";search.TextChanged+=(s,e)=>Fill();body.Controls.Add(search);
      list=new ListBox {Bounds=new Rectangle(20,196,700,180),BackColor=Theme.Input,ForeColor=Theme.Text,Font=Theme.Font(10),BorderStyle=BorderStyle.None,DrawMode=DrawMode.OwnerDrawFixed,ItemHeight=58,IntegralHeight=false};list.DrawItem+=(s,e)=>DrawRoute(e);list.SelectedIndexChanged+=(s,e)=>SelectRoute();body.Controls.Add(list);
      description=Theme.Label("",20,386,700,84,9,Theme.Muted);body.Controls.Add(description);
      var guide=new IconButton("Consultar guia de farm","live"){Bounds=new Rectangle(20,414,260,36)};guide.Click+=(s,e)=>System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("https://guiapokeidlehardtocapture.site/"){UseShellExecute=true});body.Controls.Add(guide);
      choose=new IconButton("Ir para esta hunt","play",true){Bounds=new Rectangle(390,414,250,36)};choose.Click+=(s,e)=>{var selected=list.SelectedItem as HuntChoice;if(selected==null)return;ResultJson=Data.Serializer.Serialize(new Dictionary<string,object>{{"slug",Data.S(selected.Hunt,"slug")}});DialogResult=DialogResult.OK;Close();};body.Controls.Add(choose);
      var hint=Theme.Label("Base pública do guia + cooldown atual do jogo. XP/h inclui bônus conhecidos; custos são Coins/h. Medição real aparece após farmar nesta rota; 15–30 min ajudam a comparar.",20,460,700,44,8,Theme.Muted);body.Controls.Add(hint);
      if(Data.B(advice,"available"))profile.Text+="\nBase coletada: "+Data.S(advice,"updatedAt").Split('T')[0]+" · XP Pokémon ×"+Data.N(Data.Get(advice,"multipliers"),"pokemon",1).ToString("0.##",CultureInfo.GetCultureInfo("pt-BR"))+" · "+Data.S(advice,"potionName","poção do jogo");
      recommended.Top=all.Top=134;searchLabel.Top=176;search.Top=200;list.Top=236;
      Action arrange=()=>{int width=body.ClientSize.Width-40;heading.Width=profile.Width=searchLabel.Width=search.Width=list.Width=description.Width=width;list.Height=Math.Max(58,body.ClientSize.Height-440);description.Top=list.Bottom+10;guide.Top=choose.Top=description.Bottom+12;guide.Width=(width-12)/2;choose.SetBounds(guide.Right+12,guide.Top,width-guide.Width-12,36);hint.Top=guide.Bottom+10;hint.Width=width;recommended.Width=all.Width=(width-12)/2;all.Left=recommended.Right+12;autoBest.Width=Math.Min(285,(width-12)/2);autoStatus.SetBounds(autoBest.Right+12,94,width-autoBest.Width-56,32);cancelQueued.SetBounds(width-12,94,32,32);};body.Resize+=(s,e)=>arrange();Shown+=(s,e)=>arrange();Fill();UpdateAccount(json);
    }
    public void RefreshProfile(){profile.Text=Data.B(advice,"available")?Data.S(advice,"pokemon")+" · Nv "+Theme.F(Data.N(advice,"level"))+" · "+(Data.B(advice,"healing")?"com poções em estoque":"sem cura automática disponível")+(Data.B(advice,"aoe")?" · TM AoE":"")+"\nBase coletada: "+Data.S(advice,"updatedAt").Split('T')[0]+" · XP Pokémon ×"+Data.N(Data.Get(advice,"multipliers"),"pokemon",1).ToString("0.##",CultureInfo.GetCultureInfo("pt-BR"))+" · "+Data.S(advice,"potionName","poção do jogo"):Data.S(advice,"message","Conecte a conta para receber recomendações.");}
    public void Notice(string text){autoStatus.Text=text;autoStatus.ForeColor=Theme.Amber;}
    public void UpdateAccount(string json){string oldRanking=Data.Serializer.Serialize(Data.Get(advice,"recommended"));string selectedSlug=list.SelectedItem is HuntChoice?Data.S(((HuntChoice)list.SelectedItem).Hunt,"slug"):"";account=Data.Serializer.DeserializeObject(json);advice=Data.Get(account,"huntAdvice");hunts=Data.List(Data.Get(account,"hunts")).ToList();if(oldRanking!=Data.Serializer.Serialize(Data.Get(advice,"recommended"))){Fill();foreach(HuntChoice row in list.Items)if(Data.S(row.Hunt,"slug")==selectedSlug){list.SelectedItem=row;break;}}else foreach(HuntChoice row in list.Items){row.Estimate=Data.List(Data.Get(advice,"rows")).FirstOrDefault(r=>Data.S(r,"slug")==Data.S(row.Hunt,"slug"));row.Locked=Data.Get(account,"trainerLevel")==null||Data.N(row.Hunt,"level")>Data.N(account,"trainerLevel");}bool enabled=Data.B(Data.Get(account,"autoHunt"),"enabled");autoBest.Caption="Auto melhor hunt · "+(enabled?"ligado":"desligado");autoBest.Primary=enabled;autoBest.Invalidate();autoStatus.Text=Data.S(Data.Get(account,"autoHunt"),"message","Desligado");autoStatus.ForeColor=enabled?Theme.Green:Theme.Muted;cancelQueued.Visible=Data.Get(account,"routeQueued")!=null;if(cancelQueued.Visible)autoStatus.Text="Troca agendada: "+Data.S(Data.Get(account,"routeQueued"),"name");RefreshProfile();SelectRoute();list.Invalidate();}
    class HuntChoice {public object Hunt,Estimate;public bool Locked;public int Rank;public override string ToString(){return (Locked?"[bloqueada] ":"")+Data.S(Hunt,"name")+" · Nv "+Theme.F(Data.N(Hunt,"level"));}}
    void Fill(){list.Items.Clear();var estimates=Data.List(Data.Get(advice,"rows")).ToList();var best=Data.List(Data.Get(advice,"recommended")).Select(Convert.ToString).ToList();var options=hunts.Where(h=>Data.S(h,"name").IndexOf(search.Text,StringComparison.OrdinalIgnoreCase)>=0||Data.S(h,"slug").IndexOf(search.Text,StringComparison.OrdinalIgnoreCase)>=0);options=showingRecommended?options.Where(h=>best.Contains(Data.S(h,"slug"))).OrderBy(h=>best.IndexOf(Data.S(h,"slug"))):options.OrderBy(h=>Data.N(h,"level"));foreach(var hunt in options){string slug=Data.S(hunt,"slug");list.Items.Add(new HuntChoice {Hunt=hunt,Estimate=estimates.FirstOrDefault(r=>Data.S(r,"slug")==slug),Rank=best.IndexOf(slug)+1,Locked=Data.Get(account,"trainerLevel")==null||Data.N(hunt,"level")>Data.N(account,"trainerLevel")});}recommended.Primary=showingRecommended;all.Primary=!showingRecommended;recommended.Invalidate();all.Invalidate();if(list.Items.Count>0)list.SelectedIndex=0;SelectRoute();}
    void DrawRoute(DrawItemEventArgs e){
      if(e.Index<0||e.Index>=list.Items.Count)return;var row=(HuntChoice)list.Items[e.Index];bool selected=(e.State&DrawItemState.Selected)!=0;
      using(var bg=new SolidBrush(selected?Color.FromArgb(47,39,78):Theme.Input))e.Graphics.FillRectangle(bg,e.Bounds);
      string title=(showingRecommended?"#"+row.Rank+"  ":"")+row.ToString()+(Data.S(row.Hunt,"slug")==Data.S(account,"hunt")?(Data.B(account,"inCenter")?" · rota salva":" · atual"):"");
      TextRenderer.DrawText(e.Graphics,title,Theme.Font(10,true),new Rectangle(e.Bounds.X+10,e.Bounds.Y+7,e.Bounds.Width-20,22),row.Locked?Theme.Muted:Theme.Text,TextFormatFlags.EndEllipsis|TextFormatFlags.NoPadding);
      string detail=row.Estimate==null?(row.Locked?"Nível do treinador insuficiente":"Estimativa indisponível para esta rota"):"≈ "+Theme.F(Data.N(row.Estimate,"xpHour"))+" XP/h · Risco "+Data.S(row.Estimate,"risk")+" · "+Theme.F(Data.N(row.Estimate,"potionsHour"))+" poções/h";
      Color color=row.Estimate==null?Theme.Muted:Data.S(row.Estimate,"risk")=="alto"?Theme.Red:Data.S(row.Estimate,"risk")=="moderado"?Theme.Amber:Theme.Green;
      TextRenderer.DrawText(e.Graphics,detail,Theme.Font(8.5f),new Rectangle(e.Bounds.X+10,e.Bounds.Y+31,e.Bounds.Width-20,20),color,TextFormatFlags.EndEllipsis|TextFormatFlags.NoPadding);if(selected)e.DrawFocusRectangle();
    }
    void SelectRoute(){
      if(choose==null)return;var selected=list.SelectedItem as HuntChoice;bool connected=Data.S(account,"status")=="conectada";
      bool waiting=Data.Get(account,"huntGate")!=null&&!Data.B(Data.Get(account,"huntGate"),"ready");choose.Caption=waiting?"Agendar troca de hunt":Data.B(account,"inCenter")?"Entrar nesta hunt":"Ir para esta hunt";choose.Invalidate();
      choose.Enabled=connected&&selected!=null&&!selected.Locked&&(Data.B(account,"inCenter")||Data.S(selected.Hunt,"slug")!=Data.S(account,"hunt"))&&Data.Get(account,"routePending")==null&&Data.S(Data.Get(account,"routeQueued"),"slug")!=Data.S(selected.Hunt,"slug");
      if(selected==null){description.Text=showingRecommended?Data.S(advice,"message","Nenhuma recomendação encontrada."):"Nenhuma rota encontrada.";return;}
      if(selected.Locked){description.Text="Seu treinador ainda não tem o nível exigido.";return;}
      description.Text=(connected?(Data.B(account,"inCenter")?"No Centro Pokémon · rota salva: ":"Hunt atual: "):"Última leitura, conta desconectada: ")+Data.S(account,"hunt","nenhuma").Replace('_',' ');
      if(Data.Get(account,"routePending")!=null)description.Text+=" · troca aguardando confirmação";
      else if(Data.Get(account,"routeQueued")!=null)description.Text+=" · agendada: "+Data.S(Data.Get(account,"routeQueued"),"name");
      else if(connected&&Data.Get(account,"huntGate")!=null&&!Data.B(Data.Get(account,"huntGate"),"ready"))description.Text+=" · "+Data.S(Data.Get(account,"huntGate"),"message");
      if(selected.Estimate!=null){
        description.Text+="\nAbate ≈ "+Data.N(selected.Estimate,"seconds").ToString("0.0",CultureInfo.GetCultureInfo("pt-BR"))+" s · "+Theme.F(Data.N(selected.Estimate,"potionsHour"))+" poções/h · Custo ≈ "+Theme.F(Data.N(selected.Estimate,"potionCost"))+" Coins/h.";
        description.Text+="\nXP/abate "+Theme.F(Data.N(selected.Estimate,"xpBase"))+" ("+Data.S(selected.Estimate,"xpBasis","estimado")+") · Mapa "+(Data.B(selected.Estimate,"mapEstimated")?"estimado":"com geometria do guia")+".";
      }else description.Text+="\n"+Data.S(advice,"message");
      var measured=Data.List(Data.Get(account,"huntMeasurements")).FirstOrDefault(r=>Data.S(r,"hunt")==Data.S(selected.Hunt,"slug"));
      if(measured==null)description.Text+="\nSem medição real nesta execução. Faça 15–30 min nesta hunt e reabra para comparar.";
      else description.Text+="\n"+(Data.B(measured,"ready")?"Medido":"Amostra parcial")+" · "+Data.N(measured,"minutes").ToString("0.0",CultureInfo.GetCultureInfo("pt-BR"))+" min · XP/h "+(Data.Get(measured,"pokemonHour")==null?"aguardando":Theme.F(Data.N(measured,"pokemonHour")))+" · "+Theme.F(Data.N(measured,"potionsHour"))+" poções/h"+(Data.B(measured,"buildChanged")?" · ficha/config mudou":"")+".";
    }
  }
}
