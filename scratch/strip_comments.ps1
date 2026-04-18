# PowerShell script to strip comments from source files

function Strip-Comments($filePath) {
    $content = Get-Content -Path $filePath -Raw
    
    # Remove multi-line comments /* ... */
    # Using (?s) to allow . to match newlines
    $content = $content -replace '(?s)/\*.*?\*/', ''
    
    # Remove single-line comments // ...
    # We must be careful not to match URLs (http:// or https://)
    # A safe way is to look for // that are not preceded by : or are at the start of a line/after whitespace.
    # Pattern: Look for // that is either at the start of a line or preceded by whitespace, 
    # but NOT part of a URL.
    
    # Simpler approach: Remove lines that are just whitespace + //
    $content = $content -replace '(?m)^\s*//.*$', ''
    
    # Remove trailing comments: space + // ... 
    # This might catch some strings but we'll try to be specific.
    # Most tracks use // as // so we check for space before.
    $content = $content -replace '(?m)\s\s*//(?!/).*$', ''

    # Remove empty lines that were just comments (cleanup)
    $content = $content -replace '(?m)^\s*$\s*', "`n"
    
    Set-Content -Path $filePath -Value $content.Trim()
}

# Target specific source directories and root config files
$sourceDirs = @("src", "android/app/src/main/java")
$rootFiles = Get-ChildItem -Path "." -Include *.ts, *.tsx, *.js, *.html

$files = @()
foreach ($dir in $sourceDirs) {
    if (Test-Path $dir) {
        $files += Get-ChildItem -Path $dir -Include *.ts, *.tsx, *.java, *.css -Recurse
    }
}
$files += $rootFiles

foreach ($file in $files) {
    if ($file.Name -eq "package.json" -or $file.Name -eq "package-lock.json") { continue }
    Write-Host "Stripping comments from: $($file.FullName)"
    Strip-Comments $file.FullName
}
