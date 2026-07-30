param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"
Add-Type `
  -Path $SourcePath `
  -ReferencedAssemblies @("System.Web.Extensions.dll") `
  -OutputAssembly $OutputPath `
  -OutputType ConsoleApplication
