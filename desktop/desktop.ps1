param([switch]$SmokeTest, [switch]$WindowTest, [string]$PreviewPath, [switch]$Demo)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -Path @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.cs' | Where-Object Name -ne 'desktop-launcher.cs' | ForEach-Object FullName) -ReferencedAssemblies @('System.Windows.Forms.dll','System.Drawing.dll','System.Web.Extensions.dll','System.Core.dll')
[PokeidleDesktop.DesktopNative]::Prepare()
[Windows.Forms.Application]::EnableVisualStyles()
[Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)
$script:ApiKey = $env:POKEIDLE_MANAGER_KEY
$script:BaseUrl = if ($Demo) { 'http://127.0.0.1:3848' } else { 'http://127.0.0.1:3847' }
if (-not $SmokeTest -and -not $WindowTest -and -not $script:ApiKey) { throw 'Abra iniciar.cmd para usar o painel.' }
Remove-Item Env:POKEIDLE_MANAGER_KEY -ErrorAction SilentlyContinue
$script:Latest = $null
function Request-Manager($Action, $Slot, $Config) {
  if ($Demo -and $Action -ne 'state') { throw 'Demonstração: nenhuma operação real é executada.' }
  $headers = @{ 'X-Manager-Key' = $script:ApiKey; Origin = $script:BaseUrl }
  if ($Action -eq 'state') { return Invoke-RestMethod "$script:BaseUrl/api/state" -Headers $headers -TimeoutSec 10 }
  $body = @{ action = $Action; slot = [int]$Slot }
  if ($null -ne $Config) { $body.config = $Config }
  try {
    Invoke-RestMethod "$script:BaseUrl/api/action" -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 12))) -TimeoutSec 20
  } catch {
    $detail = $_.ErrorDetails.Message
    if ($detail) { try { $detail = ($detail | ConvertFrom-Json).error } catch {} }
    if (-not $detail) { $detail = 'Não consegui falar com o bot. Verifique se o CMD está aberto.' }
    throw $detail
  }
}
function Update-Desktop($Snapshot) {
  try {
    $script:Latest = if ($null -ne $Snapshot) { $Snapshot } else { Request-Manager 'state' 0 $null }
    $script:MainForm.UpdateJson(($script:Latest | ConvertTo-Json -Depth 20 -Compress))
    if ($script:Latest.catalogError) { $script:MainForm.SetNotice($script:Latest.catalogError,$true) }
  } catch {
    if ($SmokeTest -or $WindowTest) { throw }
    $script:MainForm.SetBotStatus('OFFLINE')
    $script:MainForm.SetNotice('Sem conexão com o bot. Mantenha iniciar.cmd aberto ou reinicie-o.',$true)
  }
}
$script:MainForm = New-Object PokeidleDesktop.Dashboard
$script:MainForm.Add_Command({ param($sender,$eventArgs)
  # Do not poll HTTP from a nested modal event loop while editing a dialog.
  $resumePolling=$script:timer -and $script:timer.Enabled
  if($resumePolling){$script:timer.Stop()}
  try {
    $slot=$eventArgs.Slot; $action=$eventArgs.Action
    if ($Demo -and $action -eq 'quit') {$sender.ExitUi();return}
    if ($Demo -and $action -notin @('refresh','config','hunt','depot')) {$sender.SetNotice('Demonstração: ações reais desabilitadas. Explore as telas.',$false);return}
    if ($action -eq 'quit') {[void](Request-Manager 'shutdown' 1 $null);$sender.ExitUi();return}
    if ($action -eq 'refresh') { Update-Desktop; $sender.SetNotice('Informações atualizadas.',$false); return }
    if ($action -eq 'config') {
      $editor=$sender.CreateSupply($slot); $editor.Tag=$slot
      $editor.Add_SaveRequested({param($s,$e)
        try { [void](Request-Manager 'config' $s.Tag ($s.ResultJson | ConvertFrom-Json));$s.SaveSucceeded=$true }
        catch { $s.Error($_.Exception.Message) }
      })
      $editor.Add_DisableRequested({param($s,$e)
        try { [void](Request-Manager 'disable-purchases' $s.Tag $null);$s.SaveSucceeded=$true }
        catch { $s.Error($_.Exception.Message) }
      })
      $editor.Add_ApplyAllRequested({param($s,$e)
        try {
          $answer=[Windows.Forms.MessageBox]::Show('Aplicar os itens, quantidades, saldo a guardar e valor disponível para compras a todas as contas importadas? Isso substitui as preferências delas e pode ativar compras. Os gastos já registrados são preservados.', 'Aplicar compras a todas', 'YesNo', 'Question')
          if($answer -eq 'Yes'){[void](Request-Manager 'config-all' $s.Tag ($s.ResultJson | ConvertFrom-Json));$s.SaveSucceeded=$true}
        }catch{$s.Error($_.Exception.Message)}
      })
      $editor.Add_ReviewRequested({ param($s,$e)
        try {
          $answer=[Windows.Forms.MessageBox]::Show('Confira o estoque e o saldo no jogo antes de liberar uma compra incerta. Já conferiu e quer retomar as compras automáticas?', 'Revisar compra', 'YesNo', 'Question')
          if ($answer -eq 'Yes') { [void](Request-Manager 'review' $s.Tag $null); $s.Notice('Compras liberadas. O valor disponível para compras foi preservado.') }
        } catch { [void][Windows.Forms.MessageBox]::Show($_.Exception.Message,'Revisar compra','OK','Warning') }
      })
      if ($editor.ShowDialog($sender) -eq 'OK') {
        $sender.SetNotice('Pronto! Suas preferências de compra foram salvas.',$false)
      }
      $editor.Dispose()
    } elseif ($action -eq 'hunt') {
      Update-Desktop
      $huntPicker=New-Object PokeidleDesktop.HuntForm($sender.AccountJson($slot))
      $huntPicker.Add_Command({param($s,$e)
        try{[void](Request-Manager $e.Action $e.Slot ($e.Json|ConvertFrom-Json));Update-Desktop;$s.UpdateAccount($script:MainForm.AccountJson($s.Slot))}
        catch{$s.Notice($_.Exception.Message)}
      })
      $huntTimer=New-Object Windows.Forms.Timer;$huntTimer.Interval=1500;$huntTimer.Tag=$huntPicker
      $huntTimer.Add_Tick({param($s,$e) Update-Desktop;$s.Tag.UpdateAccount($script:MainForm.AccountJson($s.Tag.Slot))})
      try {$huntTimer.Start();if($huntPicker.ShowDialog($sender) -eq 'OK'){[void](Request-Manager 'hunt-select' $slot ($huntPicker.ResultJson | ConvertFrom-Json));$sender.SetNotice('Hunt escolhida. A troca aguarda o jogo liberar o combate; Auto melhor hunt desligado.',$false)}}finally{$huntTimer.Stop();$huntTimer.Dispose();$huntPicker.Dispose()}
    } elseif ($action -eq 'depot') {
      $depot=New-Object PokeidleDesktop.DepotForm($sender.AccountJson($slot),$slot)
      $depot.Add_Command({param($s,$e)
        try{[void](Request-Manager $e.Action $e.Slot $(if($e.Json){$e.Json|ConvertFrom-Json}else{$null}));Update-Desktop;$s.UpdateAccount($script:MainForm.AccountJson($s.Slot));$s.Notice('Pedido recebido. Confira o status e os avisos da conta.')}
        catch{$s.Notice($_.Exception.Message)}
      })
      $depotTimer=New-Object Windows.Forms.Timer;$depotTimer.Interval=3000;$depotTimer.Tag=$depot
      $depotTimer.Add_Tick({param($timerSender,$timerArgs) $timerSender.Tag.UpdateAccount($script:MainForm.AccountJson($timerSender.Tag.Slot))})
      $depotTimer.Start();[void]$depot.ShowDialog($sender);$depotTimer.Stop();$depotTimer.Dispose();$depot.Dispose()
    } elseif ($action -in @('depot-shortcut','depot-shortcut-all')) {
      Update-Desktop
      $targets=@($script:Latest.accounts | Where-Object {
        ($action -eq 'depot-shortcut-all' -or $_.slot -eq $slot) -and
        $_.imported -and $_.status -eq 'conectada' -and $_.depot.known -and
        @($_.depot.eligible).Count -gt 0 -and -not $_.saleGuard.pending -and -not $_.saleGuard.fault
      } | ForEach-Object {
        [pscustomobject]@{slot=$_.slot;nick=$_.nick;count=@($_.depot.eligible).Count;ateId=($_.depot.eligible | Measure-Object -Property id -Maximum).Maximum}
      })
      if($targets.Count -eq 0){$sender.SetNotice('Nenhum Depot disponível para venda. Conecte a conta e confira o estoque ou uma venda pendente.',$true);return}
      $summary=($targets | ForEach-Object {"$($_.nick): $($_.count) Pokémon"}) -join "`n"
      $answer=[Windows.Forms.MessageBox]::Show("Vender todo o Depot destas contas?`n`n$summary`n`nColeção, equipe e Exp. Share equipada ficam fora. Shiny e P5 no Depot ENTRAM na venda. A venda é definitiva.",'Vender Depot','YesNo','Question')
      if($answer -eq 'Yes'){
        $results=@(foreach($target in $targets){
          try{[void](Request-Manager 'depot-sell' $target.slot @{ateId=[long]$target.ateId});"$($target.nick): pedido enviado"}
          catch{"$($target.nick): $($_.Exception.Message)"}
        })
        $sender.SetNotice(($results -join ' · '),$false)
      }
    } elseif ($action -eq 'remove') {
      $answer=[Windows.Forms.MessageBox]::Show('Remover a sessão e as configurações desta conta do computador? Isso não exclui sua conta no jogo.', 'Remover conta', 'YesNo', 'Question')
      if($answer -eq 'Yes'){[void](Request-Manager 'remove' $slot $null)}
    } elseif ($action -eq 'import') {
      if ($sender.ShowImport()) { [void](Request-Manager 'import' $slot $null); $sender.SetNotice('Conta adicionada. Feche a aba do jogo e clique em Iniciar farm.',$false) }
    } elseif ($action -eq 'browser-open') {
      $sender.SetNotice('Abrindo a conta escolhida em uma janela anônima isolada...',$false)
      [void](Request-Manager 'browser-open' $slot $null)
      $sender.SetNotice('Conta aberta no navegador. Feche essa janela e clique em Iniciar para voltar ao bot.',$false)
    } elseif ($action -in @('start-all','stop-all')) {
      $command=if($action -eq 'start-all'){'start'}else{'stop'}
      foreach($a in $script:Latest.accounts){if($a.imported -and ($command -eq 'stop' -or -not $a.browser.active)){[void](Request-Manager $command $a.slot $null)}}
    } else { [void](Request-Manager $action $slot $null) }
    Update-Desktop
  } catch { $sender.SetNotice($_.Exception.Message,$true) }
  finally {if($resumePolling -and -not $sender.IsDisposed){$script:timer.Start()}}
})
if ($SmokeTest -or $WindowTest) {
  $script:MainForm.PreviewMode=$true;$script:MainForm.Text='PokeIdle Manager — dados fictícios'
  $fixture = Get-Content (Join-Path $PSScriptRoot '../test/desktop-fixture.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  Update-Desktop $fixture
  foreach($slot in 1..4){$script:MainForm.SelectAccount($slot)}
  # Fixture-only browser shortcut: check account routing and compact visibility.
  $browserCard=New-Object PokeidleDesktop.FleetCard(1)
  $browserAccount=$fixture.accounts[0]
  $browserCard.Update([PokeidleDesktop.Data]::Serializer.DeserializeObject(($browserAccount|ConvertTo-Json -Depth 20)),'')
  $script:TestBrowserAction=$null
  $browserCard.Add_Command({param($s,$e) $script:TestBrowserAction=$e})
  $browserButton=$browserCard.Controls | Where-Object {$_.AccessibleName -eq 'Abrir conta no navegador'}
  $browserButton.PerformClick()
  if($script:TestBrowserAction.Action -ne 'browser-open' -or $script:TestBrowserAction.Slot -ne 1){throw 'Atalho do navegador não identificou a conta correta.'}
  foreach($width in @(240,440)){$browserCard.CompactMode=$true;$browserCard.Width=$width;$browserCard.Arrange();foreach($button in $browserCard.Controls | Where-Object {$_ -is [PokeidleDesktop.IconButton] -and $_.Visible}){if($button.Right -gt $browserCard.Width){throw 'Atalho do navegador cortado no card compacto.'}}}
  $browserAccount | Add-Member -Force NoteProperty browser @{active=$true;opening=$false}
  $browserCard.Update([PokeidleDesktop.Data]::Serializer.DeserializeObject(($browserAccount|ConvertTo-Json -Depth 20)),'')
  $runBrowserCard=$browserCard.Controls | Where-Object {$_ -is [PokeidleDesktop.IconButton] -and $_.Glyph -eq 'play'}
  if($runBrowserCard.Enabled){throw 'Não deve iniciar o bot com a conta aberta no navegador.'}
  $browserCard.Dispose()
  $script:MainForm.SelectAccount(1)
  # Fixture-only eligibility checks: the shortcuts must never enable an unverified sale.
  $saleAccount=$script:MainForm.AccountJson(1) | ConvertFrom-Json
  if(-not [PokeidleDesktop.Data]::CanSell([PokeidleDesktop.Data]::Serializer.DeserializeObject(($saleAccount | ConvertTo-Json -Depth 20)))){throw 'Atalho de Depot não habilitado para conta elegível.'}
  $saleAccount.saleGuard.pending=@{ids=@(1)}
  if([PokeidleDesktop.Data]::CanSell([PokeidleDesktop.Data]::Serializer.DeserializeObject(($saleAccount | ConvertTo-Json -Depth 20)))){throw 'Venda pendente não deve permitir atalho.'}
  $saleAccount.saleGuard.pending=$null;$saleAccount.status='parada'
  if([PokeidleDesktop.Data]::CanSell([PokeidleDesktop.Data]::Serializer.DeserializeObject(($saleAccount | ConvertTo-Json -Depth 20)))){throw 'Conta parada não deve permitir venda.'}
  $editor=$script:MainForm.CreateSupply(1)
  $config=$editor.BuildConfig() | ConvertFrom-Json
  if ($config.rules.Count -ne 2 -or $config.rules[0].qty -ne 401) { throw 'Falha ao preservar as compras configuradas.' }
  if ($config.budget -ne 100000) { throw 'Falha ao preservar o dinheiro disponível para compras.' }
  if ($config.rules[1].qty -ne 100) { throw 'Falha ao preservar a configuração antiga por quantidade fixa.' }
  $editor.Unlimited.Checked=$true
  $unlimitedConfig=$editor.BuildConfig() | ConvertFrom-Json
  if(-not $unlimitedConfig.unlimited -or $editor.Allowance.Enabled -or $unlimitedConfig.reserve -ne $config.reserve){throw 'Falha na opção Gastar sem limite.'}
  $editor.Unlimited.Checked=$false
  if(-not $editor.Allowance.Enabled -or ($editor.BuildConfig() | ConvertFrom-Json).budget -ne 100000){throw 'Falha ao restaurar o limite de gastos.'}
  $editor.Rows[0].Amount.Value=1000000001
  $rejected=$false
  try { [void]$editor.BuildConfig() } catch { $rejected=$true }
  if(-not $rejected){throw 'Quantidade acima de um bilhão deveria ser rejeitada.'}
  $editor.Rows[0].Amount.Value=500
  $editor.Rows[0].Amount.Value=1000000
  if(($editor.BuildConfig() | ConvertFrom-Json).rules[0].qty -ne 1000000){throw 'Falha no estoque maior.'}
  $editor.Rows[0].Amount.Value=500
  if($editor.Rows[0].EstimateCost() -ne 50000){throw 'Custo da quantidade fixa deve independer do estoque atual.'}
  $editor.Rows[0].Amount.Value=10000
  if($editor.Rows[0].EstimateCost() -ne 1000000){throw 'Custo estimado de completar o estoque incorreto.'}
  $editor.Rows[0].Amount.Value=500
  $depotPreview=New-Object PokeidleDesktop.DepotForm($script:MainForm.AccountJson(1),1)
  $closing=$script:MainForm.CreateSupply(1)
  $closing.Add_SaveRequested({param($s,$e) $s.SaveSucceeded=($s.Tag -eq 'ok')})
  if($closing.Persist()){throw 'Falha ao bloquear fechamento sem confirmação de gravação.'}
  $closing.Tag='ok'
  if(-not $closing.Persist()){throw 'Falha ao salvar as preferências antes de fechar.'}
  $closing.Dispose()
  $disabled=$script:MainForm.CreateSupply(1)
  $disabled.Rows[0].Amount.Value=50
  $disabled.Add_DisableRequested({param($s,$e) $s.SaveSucceeded=$true})
  $disabled.DisablePurchases()
  if(-not $disabled.SaveSucceeded){throw 'Desligar compras não deve validar os campos do formulário.'}
  $disabled.Dispose()
  if ($PreviewPath) {
    $script:MainForm.Show()
    [Windows.Forms.Application]::DoEvents()
    $bitmap=New-Object Drawing.Bitmap($script:MainForm.Width,$script:MainForm.Height)
    $script:MainForm.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$bitmap.Width,$bitmap.Height)))
    $bitmap.Save($PreviewPath,[Drawing.Imaging.ImageFormat]::Png); $bitmap.Dispose()
    $script:MainForm.Hide()
    $script:MainForm.ShowOverview()
    $script:MainForm.Show()
    [Windows.Forms.Application]::DoEvents()
    $bitmap=New-Object Drawing.Bitmap($script:MainForm.Width,$script:MainForm.Height)
    $script:MainForm.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$bitmap.Width,$bitmap.Height)))
    $bitmap.Save((Join-Path ([IO.Path]::GetDirectoryName($PreviewPath)) 'contas-preview.png'),[Drawing.Imaging.ImageFormat]::Png);$bitmap.Dispose();$script:MainForm.Hide()
    foreach($width in 1000,800){
      $script:MainForm.ClientSize=New-Object Drawing.Size($width,740)
      $script:MainForm.Show();[Windows.Forms.Application]::DoEvents()
      $viewport=$script:MainForm.Controls | Where-Object { $_.Dock -eq [Windows.Forms.DockStyle]::Fill }
      if($viewport.HorizontalScroll.Visible){throw "Painel com rolagem horizontal em largura $width"}
      $bitmap=New-Object Drawing.Bitmap($script:MainForm.Width,$script:MainForm.Height)
      $script:MainForm.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$bitmap.Width,$bitmap.Height)))
      $bitmap.Save((Join-Path ([IO.Path]::GetDirectoryName($PreviewPath)) "contas-$width-preview.png"),[Drawing.Imaging.ImageFormat]::Png);$bitmap.Dispose();$script:MainForm.Hide()
    }
    foreach($size in @(@{width=640;height=480},@{width=800;height=540})){
      $script:MainForm.ClientSize=New-Object Drawing.Size($size.width,$size.height)
      $script:MainForm.ShowOverview();$script:MainForm.Show();[Windows.Forms.Application]::DoEvents()
      function Find-FleetCards($parent){foreach($child in $parent.Controls){if($child -is [PokeidleDesktop.FleetCard]){$child}else{Find-FleetCards $child}}}
      $cards=@(Find-FleetCards $script:MainForm)
      if($cards.Count -ne 4 -or @($cards | Where-Object {-not $_.CompactMode}).Count){throw 'As quatro contas devem usar a grade compacta.'}
      $area=$script:MainForm.RectangleToScreen($script:MainForm.ClientRectangle)
      foreach($card in $cards){$rect=$card.RectangleToScreen($card.ClientRectangle);if(-not $area.Contains($rect)){throw "Conta fora da janela em $($size.width)x$($size.height)"}}
      if(@($cards | Group-Object Left).Count -ne 2 -or @($cards | Group-Object Top).Count -ne 2){throw 'As quatro contas devem ficar em 2 x 2.'}
      $menuToggle=$script:MainForm.Controls | ForEach-Object {$_.Controls} | Where-Object {$_.AccessibleName -eq 'Abrir ou recolher menu lateral'}
      if(-not $menuToggle){throw 'Botão de abrir/recolher lateral ausente.'}
      $menuToggle.PerformClick();[Windows.Forms.Application]::DoEvents()
      if($menuToggle.Parent.Width -lt 200){throw 'Menu lateral não expandiu.'}
      if($menuToggle.Parent.AutoScroll -or $menuToggle.Parent.HorizontalScroll.Visible -or $menuToggle.Parent.VerticalScroll.Visible){throw 'Menu lateral não deve ter barras de rolagem.'}
      foreach($navButton in $menuToggle.Parent.Controls | Where-Object {$_ -is [PokeidleDesktop.IconButton]}){if($navButton.Bottom -gt $menuToggle.Parent.ClientSize.Height -or $navButton.Right -gt $menuToggle.Parent.ClientSize.Width){throw 'Botão lateral fora da área fixa.'}}
      foreach($card in $cards){if(-not $area.Contains($card.RectangleToScreen($card.ClientRectangle))){throw 'Grade cortada ao abrir a lateral.'}}
      $menuToggle.PerformClick();[Windows.Forms.Application]::DoEvents()
      if($menuToggle.Parent.Width -gt 80){throw 'Menu lateral não recolheu.'}

      $image=New-Object Drawing.Bitmap($script:MainForm.Width,$script:MainForm.Height)
      $script:MainForm.DrawToBitmap($image,(New-Object Drawing.Rectangle(0,0,$image.Width,$image.Height)))
      $image.Save((Join-Path ([IO.Path]::GetDirectoryName($PreviewPath)) "contas-$($size.width)x$($size.height)-preview.png"),[Drawing.Imaging.ImageFormat]::Png);$image.Dispose();$script:MainForm.Hide()
    }
    $script:MainForm.ClientSize=New-Object Drawing.Size(800,740)
    $script:MainForm.SelectAccount(1);$script:MainForm.Show();[Windows.Forms.Application]::DoEvents()
    $viewport=$script:MainForm.Controls | Where-Object { $_.Dock -eq [Windows.Forms.DockStyle]::Fill }
    if($viewport.HorizontalScroll.Visible){throw 'Detalhes com rolagem horizontal na janela menor.'}
    $bitmap=New-Object Drawing.Bitmap($script:MainForm.Width,$script:MainForm.Height)
    $script:MainForm.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$bitmap.Width,$bitmap.Height)))
    $bitmap.Save((Join-Path ([IO.Path]::GetDirectoryName($PreviewPath)) 'detalhes-800-preview.png'),[Drawing.Imaging.ImageFormat]::Png);$bitmap.Dispose();$script:MainForm.Hide()
    $editor.Show()
    [Windows.Forms.Application]::DoEvents()
    $bitmap=New-Object Drawing.Bitmap($editor.Width,$editor.Height)
    $editor.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$bitmap.Width,$bitmap.Height)))
    $supplyPreview=Join-Path ([IO.Path]::GetDirectoryName($PreviewPath)) 'compras-preview.png'
    $bitmap.Save($supplyPreview,[Drawing.Imaging.ImageFormat]::Png);$bitmap.Dispose();$editor.Hide()
    $depotPreview.Show();[Windows.Forms.Application]::DoEvents()
    $depotBody=$depotPreview.Controls | Where-Object { $_.Dock -eq [Windows.Forms.DockStyle]::Fill }
    if(-not $depotBody -or $depotBody.Top -lt 52){throw 'Conteúdo do Depot sobrepondo a barra de título.'}
    foreach($toggle in @($editor.Unlimited,$editor.EnabledPurchases,$depotPreview.AutoSell)){
      if($toggle.AutoSize -or $toggle.FlatStyle -ne 'Flat'){throw 'Toggle usando desenho nativo inconsistente.'}
    }
    $bitmap=New-Object Drawing.Bitmap($depotPreview.Width,$depotPreview.Height)
    $depotPreview.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$bitmap.Width,$bitmap.Height)))
    $bitmap.Save((Join-Path ([IO.Path]::GetDirectoryName($PreviewPath)) 'depot-preview.png'),[Drawing.Imaging.ImageFormat]::Png);$bitmap.Dispose();$depotPreview.Hide()
  }
  # Exercise route eligibility and resized layout with fixtures, without contacting the game.
  $huntAccount=$script:MainForm.AccountJson(1) | ConvertFrom-Json
  $huntAccount.status='conectada';$huntAccount.hunt='rota-atual';$huntAccount.trainerLevel=50
  $huntAccount | Add-Member -Force NoteProperty hunts @(@{slug='rota-atual';name='Rota atual';level=1},@{slug='nova-rota';name='Nova rota';level=10},@{slug='bloqueada';name='Rota bloqueada';level=100})
  $huntAccount | Add-Member -Force NoteProperty routePending $null
  $huntPreview=New-Object PokeidleDesktop.HuntForm(($huntAccount | ConvertTo-Json -Depth 20))
  $huntPreview.Show();[Windows.Forms.Application]::DoEvents()
  $huntBody=$huntPreview.Controls | Where-Object {$_.Dock -eq 'Fill'}
  $huntList=$huntBody.Controls | Where-Object {$_ -is [Windows.Forms.ListBox]}
  $huntChoose=$huntBody.Controls | Where-Object {$_ -is [PokeidleDesktop.IconButton] -and $_.Caption -eq 'Ir para esta hunt'}
  $autoHuntButton=$huntBody.Controls | Where-Object {$_ -is [PokeidleDesktop.IconButton] -and $_.Caption -eq 'Auto melhor hunt · desligado'}
  $script:TestAutoHuntAction=$null
  $huntPreview.Add_Command({param($s,$e) $script:TestAutoHuntAction=$e})
  $autoHuntButton.PerformClick()
  if($script:TestAutoHuntAction.Action -ne 'hunt-auto' -or -not ($script:TestAutoHuntAction.Json|ConvertFrom-Json).enabled){throw 'Botão Auto melhor hunt não enviou a configuração correta.'}
  if($huntChoose.Enabled){throw 'Não deve reenviar a hunt atual.'}
  $huntList.SelectedIndex=2
  if($huntChoose.Enabled){throw 'Hunt bloqueada por nível não deve habilitar troca.'}
  $huntList.SelectedIndex=1
  if(-not $huntChoose -or -not $huntChoose.Enabled){throw 'Hunt liberada deveria permitir troca.'}
  $huntAccount | Add-Member -Force NoteProperty huntGate @{ready=$false;message='aguardando combate'}
  $huntPreview.UpdateAccount(($huntAccount|ConvertTo-Json -Depth 20))
  if(-not $huntChoose.Enabled -or $huntChoose.Caption -ne 'Agendar troca de hunt'){throw 'Escolha manual deve permitir agendar a troca durante o combate.'}
  $huntAccount | Add-Member -Force NoteProperty routeQueued @{slug='nova-rota';name='Nova rota'}
  $huntPreview.UpdateAccount(($huntAccount|ConvertTo-Json -Depth 20))
  if($huntChoose.Enabled){throw 'Não deve agendar duas vezes a mesma hunt.'}
  $cancelHunt=$huntBody.Controls | Where-Object {$_.AccessibleName -eq 'Cancelar troca agendada'}
  if(-not $cancelHunt.Visible){throw 'Cancelamento da troca agendada ausente.'}
  $cancelHunt.PerformClick()
  if($script:TestAutoHuntAction.Action -ne 'hunt-cancel'){throw 'Cancelamento da troca agendada incorreto.'}
  $huntAccount.routeQueued=$null;$huntAccount.huntGate.ready=$true
  $huntPreview.UpdateAccount(($huntAccount|ConvertTo-Json -Depth 20))
  $huntAccount | Add-Member -Force NoteProperty inCenter $true
  $huntAccount.hunt='nova-rota'
  $huntPreview.UpdateAccount(($huntAccount|ConvertTo-Json -Depth 20))
  if(-not $huntChoose.Enabled -or $huntChoose.Caption -ne 'Entrar nesta hunt'){throw 'Conta no Centro deve poder entrar na rota salva.'}
  $huntAccount.inCenter=$false;$huntAccount.hunt='rota-atual'
  $huntPreview.UpdateAccount(($huntAccount|ConvertTo-Json -Depth 20))
  foreach($height in @(660,560)){
    $huntPreview.ClientSize=New-Object Drawing.Size(640,$height);[Windows.Forms.Application]::DoEvents()
    if($huntBody.Top -lt 52){throw 'Hunt sobrepondo a barra de título.'}
    if($huntList.Height -lt $huntList.ItemHeight){throw 'A lista de hunts perdeu as linhas ao reduzir a janela.'}
    foreach($control in $huntBody.Controls){if($control.Right -gt $huntBody.Width -or $control.Bottom -gt $huntBody.Height){throw 'Conteúdo da hunt fora da janela.'}}
    if($PreviewPath){
      $image=New-Object Drawing.Bitmap($huntPreview.Width,$huntPreview.Height)
      $huntPreview.DrawToBitmap($image,(New-Object Drawing.Rectangle(0,0,$image.Width,$image.Height)))
      $image.Save((Join-Path ([IO.Path]::GetDirectoryName($PreviewPath)) "hunt-$height-preview.png"),[Drawing.Imaging.ImageFormat]::Png);$image.Dispose()
    }
  }
  $huntChoose.PerformClick()
  if(($huntPreview.ResultJson | ConvertFrom-Json).slug -ne 'nova-rota'){throw 'Hunt selecionada incorreta.'}
  $huntPreview.Dispose()
  $huntAccount | Add-Member -Force NoteProperty huntAdvice @{available=$true;pokemon='Venusaur';level=280;healing=$true;recommended=@('nova-rota','rota-atual');message='Ranking por XP estimado';rows=@(@{slug='nova-rota';xpHour=12800000;risk='baixo';seconds=2.4;potionsHour=36;potionCost=4860},@{slug='rota-atual';xpHour=8000000;risk='moderado';seconds=4.2;potionsHour=80;potionCost=10800})}
  $rankingPreview=New-Object PokeidleDesktop.HuntForm(($huntAccount | ConvertTo-Json -Depth 20))
  $rankingPreview.Show();[Windows.Forms.Application]::DoEvents()
  $rankingBody=$rankingPreview.Controls | Where-Object {$_.Dock -eq 'Fill'}
  $rankingList=$rankingBody.Controls | Where-Object {$_ -is [Windows.Forms.ListBox]}
  if($rankingList.Items.Count -ne 2 -or $rankingList.SelectedItem.ToString() -notlike '*Nova rota*'){throw 'Ranking não selecionou a melhor recomendação.'}
  if($PreviewPath){
    $image=New-Object Drawing.Bitmap($rankingPreview.Width,$rankingPreview.Height)
    $rankingPreview.DrawToBitmap($image,(New-Object Drawing.Rectangle(0,0,$image.Width,$image.Height)))
    $image.Save((Join-Path ([IO.Path]::GetDirectoryName($PreviewPath)) 'hunt-ranking-preview.png'),[Drawing.Imaging.ImageFormat]::Png);$image.Dispose()
  }
  ($rankingBody.Controls | Where-Object {$_ -is [PokeidleDesktop.IconButton] -and $_.Caption -eq 'Todas as hunts'}).PerformClick()
  if($rankingList.Items.Count -ne 3){throw 'Não retornou ao catálogo manual de hunts.'}
  $rankingPreview.Close();$rankingPreview.Dispose()
  # Exercise the actual modal loop and custom close button after resizing, using fixtures only.
  $modal=$script:MainForm.CreateSupply(1)
  $modal.Rows[0].Amount.Value=1000000001
  $modal.Add_SaveRequested({param($s,$e) throw 'Fechar pelo X não deve chamar a API ou validar campos.'})
  $modal.Add_Shown({param($s,$e)
    $s.ClientSize=New-Object Drawing.Size(760,540)
    [Windows.Forms.Application]::DoEvents()
    if($s.ResizeHit((New-Object Drawing.Point(2,100))) -ne 10){throw 'Borda esquerda não permite redimensionamento.'}
    $s.WindowState='Maximized';[Windows.Forms.Application]::DoEvents()
    $s.WindowState='Normal';[Windows.Forms.Application]::DoEvents()
    if($s.Size.Width -gt [Windows.Forms.Screen]::FromControl($s).WorkingArea.Width){throw 'Janela excedeu o monitor ao restaurar.'}
    if($PreviewPath){
      $image=New-Object Drawing.Bitmap($s.Width,$s.Height)
      $s.DrawToBitmap($image,(New-Object Drawing.Rectangle(0,0,$image.Width,$image.Height)))
      $image.Save((Join-Path ([IO.Path]::GetDirectoryName($PreviewPath)) 'compras-760-preview.png'),[Drawing.Imaging.ImageFormat]::Png);$image.Dispose()
    }
    $footer=$s.Controls | Where-Object {$_.Dock -eq 'Bottom'}
    foreach($button in $footer.Controls | Where-Object {$_ -is [PokeidleDesktop.IconButton]}){
      if($button.Right -gt $footer.ClientSize.Width -or $button.Bottom -gt $footer.ClientSize.Height){throw 'Botão de compras fora da janela menor.'}
    }
  })
  $modalTimer=New-Object Windows.Forms.Timer
  $modalTimer.Interval=150;$modalTimer.Tag=$modal
  $modalTimer.Add_Tick({param($s,$e)
    $s.Stop();$title=$s.Tag.Controls | Where-Object {$_.Dock -eq 'Top' -and $_.Height -eq 52}
    $closeButton=$title.Controls | Where-Object {$_ -is [PokeidleDesktop.IconButton] -and $_.Glyph -eq 'close'}
    $closeButton.PerformClick()
  })
  $modalTimer.Start();[void]$modal.ShowDialog($script:MainForm)
  $modalTimer.Dispose()
  if($modal.DialogResult -ne 'Cancel' -or $modal.SaveSucceeded){throw 'Fechar janela modal deve funcionar sem requisição de gravação.'}
  $modal.Dispose()
  $discard=$script:MainForm.CreateSupply(1)
  $discard.Rows[0].Amount.Value=1000000001
  $discard.Discard()
  if($discard.DialogResult -ne 'Cancel'){throw 'Fechar sem salvar deve funcionar mesmo com campo inválido.'}
  $discard.Dispose()
  $editor.Dispose()
  $depotPreview.Dispose()
  $chromeTest=New-Object PokeidleDesktop.PremiumForm
  $chromeTest.EnableTray({})
  $chromeTest.Show();[Windows.Forms.Application]::DoEvents()
  if($chromeTest.FormBorderStyle -ne 'None' -or -not $chromeTest.Region){throw 'Chrome customizado ausente.'}
  $chromeTest.Close();[Windows.Forms.Application]::DoEvents()
  if($chromeTest.IsDisposed -or $chromeTest.Visible){throw 'Fechar o painel deve recolher na bandeja.'}
  $chromeTest.RestorePanel();[Windows.Forms.Application]::DoEvents()
  if(-not $chromeTest.Visible){throw 'Falha ao restaurar o painel.'}
  $chromeTest.ExitUi();$chromeTest.Dispose()
  Write-Output 'Design e compras OK: quatro contas, regras preservadas e valores de Coins validados.'
  if ($SmokeTest) { $script:MainForm.Dispose(); exit }
  $script:MainForm.Text='PokeIdle Manager — Prévia com dados de exemplo'
}
if ($Demo) {$script:MainForm.PreviewMode=$true;$script:MainForm.Text='PokeIdle Manager — dados fictícios';$script:MainForm.Text='PokeIdle Manager — demonstração';$script:MainForm.SetNotice('Dados fictícios. Nenhuma conta do jogo é acessada.',$false)}
$timer=New-Object Windows.Forms.Timer
$timer.Interval=3000
if($WindowTest){$timer.Interval=1500;$timer.Add_Tick({$script:MainForm.ExitUi()})}else{$timer.Add_Tick({Update-Desktop})}
$timer.Start()
$script:MainForm.Add_Shown({
  $script:MainForm.WindowState='Normal';$script:MainForm.Activate();$script:MainForm.BringToFront()
  try {[Console]::WriteLine('PANEL_READY')}catch{}
  if(-not $WindowTest){Update-Desktop}
})
[Windows.Forms.Application]::Run($script:MainForm)
$timer.Stop();$timer.Dispose();$script:MainForm.Dispose()
