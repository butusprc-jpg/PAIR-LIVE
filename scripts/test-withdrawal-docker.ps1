param([int]$Port = 55439)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

$baseline = '58805da59a993d795587fd3d210c8b552aad7bbc'
git cat-file -e "$baseline^{commit}"
if ($LASTEXITCODE -ne 0) { throw "Missing withdrawal commit $baseline; import the supplied Git bundle first." }
git merge-base --is-ancestor $baseline HEAD
if ($LASTEXITCODE -ne 0) { throw 'HEAD does not contain withdrawal commit 5cca8c4.' }
if (git status --porcelain) { throw 'Working tree has uncommitted changes. Use the supplied commit before testing.' }

docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is unavailable.' }
$container = 'pair-live-withdrawal-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
$password = [guid]::NewGuid().ToString('N')
$savedDatabaseVariables = @{}
foreach ($name in @('DATABASE_URL', 'TOPUP_TEST_DATABASE_URL', 'MIGRATION_TEST_DATABASE_URL', 'WALLET_TEST_DATABASE_URL')) {
    $savedDatabaseVariables[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
}
try {
    docker run --rm -d --name $container -e "POSTGRES_PASSWORD=$password" -e POSTGRES_DB=pair_live_migration_test -p "127.0.0.1:${Port}:5432" postgres:16-alpine | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not start isolated PostgreSQL. Check Docker and the selected port.' }
    $ready = $false
    for ($i = 0; $i -lt 40; $i++) {
        docker exec $container pg_isready -U postgres -d pair_live_migration_test *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'PostgreSQL did not become ready.' }
    $env:TOPUP_TEST_DATABASE_URL = "postgresql://postgres:${password}@127.0.0.1:${Port}/pair_live_migration_test"
    Write-Host "Testing HEAD $(git rev-parse HEAD) against Docker PostgreSQL on localhost:$Port"
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
    npm test
    if ($LASTEXITCODE -ne 0) { throw 'npm test failed; inspect the failing test and do not push.' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'npm run build failed; do not push.' }
    Write-Host 'PASS: npm test and npm run build. Review any SKIP lines before push.'
} finally {
    foreach ($name in $savedDatabaseVariables.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedDatabaseVariables[$name], 'Process')
    }
    docker rm -f $container *> $null
}
