param([string]$OutputDirectory)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $OutputDirectory){$OutputDirectory=Join-Path $root 'dist'}
[void](New-Item -ItemType Directory -Path $OutputDirectory -Force)
$archive=Join-Path $OutputDirectory 'pokeidle-manager-source.zip'
if(Test-Path -LiteralPath $archive){throw 'O arquivo de destino já existe; escolha outra pasta para preservar a versão anterior.'}
$stage=Join-Path $OutputDirectory ([guid]::NewGuid().ToString('N'))
$bundle=Join-Path $stage 'pokeidle-manager'
[void](New-Item -ItemType Directory -Path (Join-Path $bundle 'data') -Force)
foreach($name in @('src','desktop','scripts','public','test','docs','.github','README.md','package.json','.gitignore','.gitattributes','.node-version','iniciar.cmd')){
  Copy-Item -LiteralPath (Join-Path $root $name) -Destination $bundle -Recurse
}
Copy-Item -LiteralPath (Join-Path $root 'data/README.md') -Destination (Join-Path $bundle 'data/README.md')
Compress-Archive -LiteralPath $bundle -DestinationPath $archive -CompressionLevel Optimal
Write-Output $archive
