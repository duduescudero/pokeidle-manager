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
  public class SupplyRow:Card {
    public CheckBox Active;public ComboBox Item;public NumericUpDown Minimum,Amount;Label amountLabel,explanation;public event EventHandler EstimateChanged;object account;bool converted;List<object> choices;
    public SupplyRow(object a,object rule,string group=null){account=a;converted=rule!=null&&Data.Get(rule,"target")!=null;Height=186;Width=805;Margin=new Padding(0,0,0,12);choices=Data.List(Data.Get(a,"catalog")).Where(i=>group==null||Data.Group(i)==group).ToList();
      string key=Data.S(rule,"kind")+":"+Data.S(rule,"id");if(rule!=null&&!choices.Any(i=>Data.S(i,"kind")+":"+Data.S(i,"id")==key))choices.Add(new Dictionary<string,object>{{"kind",Data.S(rule,"kind")},{"id",Data.N(rule,"id")},{"name","Item "+Data.S(rule,"id")+" (conecte para atualizar)"},{"price",0}});
      Active=new ToggleSwitch {Text=group??"Outro suprimento",Bounds=new Rectangle(18,13,240,26),Checked=rule!=null,ForeColor=Theme.Text,Font=Theme.Font(11,true)};Controls.Add(Active);
      Item=new DarkCombo {Bounds=new Rectangle(18,53,263,28),Font=Theme.Font(10)};foreach(var i in choices)Item.Items.Add(Data.S(i,"name"));if(choices.Count>0){int index=choices.FindIndex(i=>Data.S(i,"kind")+":"+Data.S(i,"id")==key);if(index<0)index=choices.Select((i,n)=>new{n,qty=Data.Stock(a,i)}).OrderByDescending(v=>v.qty).First().n;Item.SelectedIndex=index;}Controls.Add(Item);
      Controls.Add(Theme.Label("Quando tiver menos de",302,29,188,22,9,Theme.Muted));Minimum=Number(302,53,160,rule==null?100:Data.N(rule,"min"));Controls.Add(Minimum);
      amountLabel=Theme.Label("Comprar por vez",493,29,220,22,9,Theme.Muted);Controls.Add(amountLabel);Amount=Number(493,53,170,rule==null?500:Data.Get(rule,"target")!=null?Math.Max(1,Data.N(rule,"target")-Data.N(rule,"min")+1):Data.N(rule,"qty"));Controls.Add(Amount);
      explanation=Theme.Label("",18,101,762,72,9,Theme.Muted);Controls.Add(explanation);
      Active.CheckedChanged+=(s,e)=>Describe();Item.SelectedIndexChanged+=(s,e)=>Describe();Minimum.ValueChanged+=(s,e)=>Describe();Amount.ValueChanged+=(s,e)=>Describe();Resize+=(s,e)=>ArrangeRow();ArrangeRow();Describe();
    }
    void ArrangeRow(){int w=Width-36;int itemWidth=(int)(w*0.38),field=(w-itemWidth-40)/2;Item.SetBounds(18,53,itemWidth,Item.Height);Minimum.Parent.SetBounds(38+itemWidth,53,field,29);Amount.Parent.SetBounds(58+itemWidth+field,53,field,29);var caption=Controls.OfType<Label>().First(l=>l.Text=="Quando tiver menos de");caption.SetBounds(38+itemWidth,29,field,22);amountLabel.SetBounds(58+itemWidth+field,29,field,22);explanation.Width=w;}
    static NumericUpDown Number(int x,int y,int w,double value){return new ModernNumeric {Bounds=new Rectangle(x,y,w,29),Maximum=9007199254740991M,Minimum=1,Value=(decimal)Math.Max(1,value),ThousandsSeparator=true,BackColor=Theme.Bg,ForeColor=Theme.Text,Font=Theme.Font(11)};}
    void Describe(){if(EstimateChanged!=null)EstimateChanged(this,EventArgs.Empty);Item.Enabled=Minimum.Enabled=Amount.Enabled=Active.Checked;if(!Active.Checked){explanation.Text="Desligado. O bot não compra este item.";return;}if(Item.SelectedIndex<0){explanation.Text="Conecte a conta para escolher um item.";return;}object i=choices[Item.SelectedIndex];string example="Abaixo de "+Theme.F((double)Minimum.Value)+", comprar "+Theme.F((double)Amount.Value)+" por vez.";explanation.Text=example+"\nAgora: "+Theme.F(Data.Stock(account,i))+" · unidade: "+Theme.F(Data.N(i,"price"))+" Coins\nEstimativa: "+Theme.F(EstimateQuantity())+" unidades · "+(EstimateCost()<0?"preço indisponível":Theme.F(EstimateCost())+" Coins")+(converted?"\nRegra antiga convertida para quantidade fixa. Revise antes de salvar.":"");}
    public double EstimateQuantity(){return !Active.Checked||Item.SelectedIndex<0?0:(double)Amount.Value;} public double EstimateCost(){if(!Active.Checked)return 0;if(Item.SelectedIndex<0||Data.N(choices[Item.SelectedIndex],"price")<=0)return -1;return EstimateQuantity()*Data.N(choices[Item.SelectedIndex],"price");}
    public object Read(){if(!Active.Checked)return null;if(Item.SelectedIndex<0)throw new Exception("Escolha o item que deseja comprar.");var i=choices[Item.SelectedIndex];double min=(double)Minimum.Value,amount=(double)Amount.Value;if(amount>1000000000||min>1000000000)throw new Exception("A quantidade por compra deve ser no máximo 1 bilhão.");return new Dictionary<string,object>{{"kind",Data.S(i,"kind")},{"id",Data.N(i,"id")},{"min",min},{"qty",amount}};}
  }
  // Selection uses only routes sent by the game; the external guide is a consultation link.
  public class SupplyForm:PremiumForm {
    public string ResultJson;public bool SaveSucceeded;bool saved;public List<SupplyRow> Rows=new List<SupplyRow>();public CheckBox EnabledPurchases,Unlimited;public NumericUpDown Reserve,Allowance;object account;FlowLayoutPanel rowList;Label status,totalEstimate;
    public SupplyForm(string json){account=Data.Serializer.DeserializeObject(json);Text="Compras automáticas · "+Data.S(account,"nick");ClientSize=new Size(874,810);MinimumSize=new Size(760,520);StartPosition=FormStartPosition.CenterParent;BackColor=Theme.Bg;ForeColor=Theme.Text;Font=Theme.Font();MinimizeBox=false;MaximizeBox=true;AutoScaleMode=AutoScaleMode.Dpi;
      var header=new SmoothPanel {Dock=DockStyle.Top,Height=117};header.Controls.Add(Theme.Label("Seu estoque, sempre pronto",24,18,800,38,23,Theme.Text,true));header.Controls.Add(Theme.Label("Escolha o estoque mínimo e a quantidade que o bot compra por vez.",26,61,800,24,10,Theme.Muted));EnabledPurchases=new ToggleSwitch {Text="Permitir compras automáticas nesta conta",Bounds=new Rectangle(26,88,810,24),Checked=Data.B(Data.Get(account,"config"),"enabled"),ForeColor=Theme.Green,Font=Theme.Font(10,true)};header.Controls.Add(EnabledPurchases);
      var scroll=new SmoothPanel {Dock=DockStyle.Fill,AutoScroll=true,Padding=new Padding(24,10,24,16)};rowList=new FlowLayoutPanel {FlowDirection=FlowDirection.TopDown,WrapContents=false,AutoSize=true,Location=new Point(24,8),Width=805};scroll.Controls.Add(rowList);
      var existing=Data.List(Data.Get(Data.Get(account,"config"),"rules")).ToList();foreach(var r in existing){object item=Data.List(Data.Get(account,"catalog")).FirstOrDefault(i=>Data.S(i,"kind")==Data.S(r,"kind")&&Data.N(i,"id")==Data.N(r,"id"));AddRow(r,item==null?null:Data.Group(item));}
      foreach(var group in new[]{"Pokébolas","Poções","Revives"})if(!Rows.Any(r=>r.Active.Text==group))AddRow(null,group);
      var add=new IconButton("Adicionar outro item","plus"){Width=250,Margin=new Padding(0,0,0,14)};add.Click+=(s,e)=>{if(Rows.Count>=12){MessageBox.Show("Use no máximo 12 itens por conta.");return;}var row=new SupplyRow(account,null);Rows.Add(row);row.EstimateChanged+=(rowSender,rowArgs)=>UpdateEstimate();rowList.Controls.Add(row);UpdateEstimate();rowList.Controls.SetChildIndex(row,Rows.Count-1);};rowList.Controls.Add(add);
      var money=new Card {Width=805,Height=226,Margin=new Padding(0,0,0,12)};money.Controls.Add(Theme.Label("Limite de gastos",18,14,760,29,15,Theme.Text,true));money.Controls.Add(Theme.Label("Coins que quero guardar",18,53,365,22,10,Theme.Muted));money.Controls.Add(Theme.Label("Coins disponíveis para novas compras",409,53,372,22,10,Theme.Muted));
      var config=Data.Get(account,"config");double spent=Data.N(Data.Get(account,"guard"),"spent");Reserve=Money(18,81,Data.N(config,"reserve"));Allowance=Money(409,81,Math.Max(0,Data.N(config,"budget")-spent));money.Controls.AddRange(new Control[]{Reserve,Allowance});money.Controls.Add(Theme.Label("O bot preserva esse saldo na conta.",18,122,364,26,9,Theme.Muted));money.Controls.Add(Theme.Label("Esse valor dura até acabar. Reiniciar não o renova.",409,122,376,42,9,Theme.Muted));Unlimited=new ToggleSwitch {Text="Gastar sem limite",Bounds=new Rectangle(409,170,372,27),Checked=Data.B(config,"unlimited"),ForeColor=Theme.Green,Font=Theme.Font(11,true)};money.Controls.Add(Unlimited);var unlimitedHint=Theme.Label("Continua respeitando os Coins que você quer guardar.",18,172,373,40,9,Theme.Muted);money.Controls.Add(unlimitedHint);Unlimited.CheckedChanged+=(s,e)=>{Allowance.Enabled=!Unlimited.Checked;};Allowance.Enabled=!Unlimited.Checked;rowList.Controls.Add(money);rowList.Controls.SetChildIndex(money,0);
      totalEstimate=Theme.Label("",18,214,760,47,10,Theme.Amber,true);money.Height=283;money.Controls.Add(totalEstimate);UpdateEstimate();if(Data.S(Data.Get(account,"guard"),"fault")!=""){var review=new IconButton("Revisar compra que ficou pendente","shield"){Width=420};review.Click+=(s,e)=>{if(ReviewRequested!=null)ReviewRequested(this,EventArgs.Empty);};rowList.Controls.Add(review);}
      var bottom=new SmoothPanel {Dock=DockStyle.Bottom,Height=92,BackColor=Color.FromArgb(17,22,34)};status=Theme.Label("Salvar compras aplica as alterações. Fechar sem salvar mantém a configuração anterior.",24,12,815,32,9,Theme.Amber);bottom.Controls.Add(status);var save=new IconButton("Salvar compras","shield",true){Bounds=new Rectangle(653,47,195,37)};save.Click+=(s,e)=>TrySave();var cancel=new IconButton("Fechar sem salvar","close"){Bounds=new Rectangle(24,47,172,37)};cancel.Click+=(s,e)=>Discard();bottom.Controls.AddRange(new Control[]{save,cancel});var disable=new IconButton("Desligar compras","pause"){Bounds=new Rectangle(213,47,207,37)};disable.Click+=(s,e)=>DisablePurchases();bottom.Controls.Add(disable);var applyAll=new IconButton("Aplicar a todas","ball"){Bounds=new Rectangle(434,47,205,37)};applyAll.Click+=(s,e)=>{try{ResultJson=BuildConfig();SaveSucceeded=false;if(ApplyAllRequested!=null)ApplyAllRequested(this,EventArgs.Empty);if(SaveSucceeded){saved=true;DialogResult=DialogResult.OK;Close();}}catch(Exception ex){Error(ex.Message);}};bottom.Controls.Add(applyAll);Controls.Add(scroll);Controls.Add(bottom);Controls.Add(header);// Closing is local and immediate: never wait for HTTP or validation in FormClosing.
      FormClosing+=(s,e)=>{if(!saved){DialogResult=DialogResult.Cancel;}};
      // Keep all footer actions reachable when the window shrinks; only the item list scrolls.
      Action arrange=()=>{
        int width=Math.Max(640,scroll.ClientSize.Width-56-SystemInformation.VerticalScrollBarWidth);
        rowList.Width=width;foreach(Control row in rowList.Controls)if(row is Card)row.Width=width;
        header.Controls[0].Width=header.Controls[1].Width=EnabledPurchases.Width=Math.Max(200,header.Width-52);
        bool compact=bottom.Width<850;bottom.Height=compact?142:92;status.Width=Math.Max(200,bottom.Width-48);
        status.Height=compact?42:32;int gap=12,count=compact?2:4,bw=(bottom.Width-48-gap*(count-1))/count;
        var actions=new[]{cancel,disable,applyAll,save};for(int i=0;i<4;i++)actions[i].SetBounds(24+(i%count)*(bw+gap),(compact?58:47)+(i/count)*42,bw,37);
        int col=(width-54)/2;bool stack=width<700;
        Reserve.Parent.SetBounds(18,81,stack?width-36:col,31);
        Allowance.Parent.SetBounds(stack?18:36+col,stack?181:81,stack?width-36:col,31);
        money.Controls[0].Width=width-36;
        // Labels and fields retain their native values/events; this only arranges their containers.
        var labels=money.Controls.OfType<Label>().Where(l=>l!=totalEstimate).ToArray();
        labels[1].SetBounds(18,53,stack?width-36:col,22);labels[2].SetBounds(stack?18:36+col,stack?153:53,stack?width-36:col,22);
        labels[3].SetBounds(18,122,stack?width-36:col,26);labels[4].SetBounds(stack?18:36+col,stack?222:122,stack?width-36:col,42);
        Unlimited.SetBounds(stack?18:36+col,stack?272:170,stack?width-36:col,27);unlimitedHint.SetBounds(18,stack?310:172,stack?width-36:col,40);
        totalEstimate.SetBounds(18,stack?354:214,width-36,55);money.Height=stack?424:283;
      };Resize+=(s,e)=>arrange();Shown+=(s,e)=>arrange();arrange();
    }
    public void Discard(){saved=true;DialogResult=DialogResult.Cancel;Close();}
    public event EventHandler ReviewRequested,SaveRequested,DisableRequested,ApplyAllRequested;
    public void Error(string text){status.Text=text;status.ForeColor=Theme.Amber;}
    public void DisablePurchases(){SaveSucceeded=false;if(DisableRequested!=null)DisableRequested(this,EventArgs.Empty);if(SaveSucceeded){saved=true;DialogResult=DialogResult.OK;Close();}}
    public bool Persist(){try{ResultJson=BuildConfig();SaveSucceeded=false;if(SaveRequested!=null)SaveRequested(this,EventArgs.Empty);else SaveSucceeded=true;if(SaveSucceeded)saved=true;return SaveSucceeded;}catch(Exception ex){Error(ex.Message);return false;}} public void TrySave(){if(Persist()){DialogResult=DialogResult.OK;Close();}}
    public void Notice(string text){status.Text=text;status.ForeColor=Theme.Green;}
    NumericUpDown Money(int x,int y,double val){return new ModernNumeric {Bounds=new Rectangle(x,y,364,31),Minimum=0,Maximum=9007199254740991M,Value=(decimal)val,ThousandsSeparator=true,BackColor=Theme.Bg,ForeColor=Theme.Text,Font=Theme.Font(12)};}
    void UpdateEstimate(){if(totalEstimate==null)return;var costs=Rows.Select(r=>r.EstimateCost()).ToList();totalEstimate.Text="Total potencial: "+Theme.F(costs.Where(c=>c>=0).Sum())+" Coins"+(costs.Any(c=>c<0)?" + itens com preço indisponível":"")+"\nEstimativa para os itens ativos; compras ocorrem ao atingir o mínimo e respeitam seus limites.";}
    void AddRow(object rule,string group){var row=new SupplyRow(account,rule,group);Rows.Add(row);row.EstimateChanged+=(rowSender,rowArgs)=>UpdateEstimate();rowList.Controls.Add(row);UpdateEstimate();}
    public string BuildConfig(){var rules=Rows.Select(r=>r.Read()).Where(r=>r!=null).ToArray();if(EnabledPurchases.Checked&&rules.Length==0)throw new Exception("Marque pelo menos um item que o bot pode comprar por você.");var keys=new HashSet<string>();foreach(var r in rules)if(!keys.Add(Data.S(r,"kind")+":"+Data.S(r,"id")))throw new Exception("O mesmo item foi escolhido duas vezes. Deixe apenas uma opção ativa para ele.");double budget=Data.N(Data.Get(account,"guard"),"spent")+(double)Allowance.Value;if(budget>9007199254740991d)throw new Exception("O limite de compras é muito grande.");return Data.Serializer.Serialize(new Dictionary<string,object>{{"enabled",EnabledPurchases.Checked},{"reserve",(double)Reserve.Value},{"budget",budget},{"unlimited",Unlimited.Checked},{"rules",rules}});}
  }
}
