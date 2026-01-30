; Pulsarr Windows Installer
; Built with Inno Setup - https://jrsoftware.org/isinfo.php

#define MyAppName "Pulsarr"
#define MyAppPublisher "Pulsarr"
#define MyAppURL "https://github.com/jamcalli/Pulsarr"
#define MyAppExeName "start.bat"
#define MyAppDataDir "{commonappdata}\Pulsarr"

; Version is passed from CI: iscc /DMyAppVersion=x.x.x pulsarr.iss
#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif

[Setup]
AppId={{B8A42C5E-7D91-4F8C-B5E3-9A7C6D8E2F10}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={commonappdata}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=license.txt
OutputDir=Output
OutputBaseFilename=pulsarr-v{#MyAppVersion}-windows-x64-setup
SetupIconFile=pulsarr.ico
UninstallDisplayIcon={app}\pulsarr.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Types]
Name: "full"; Description: "Full installation (with Windows Service)"
Name: "compact"; Description: "Compact installation (manual start)"
Name: "custom"; Description: "Custom installation"; Flags: iscustom

[Components]
Name: "main"; Description: "Pulsarr Application"; Types: full compact custom; Flags: fixed
Name: "service"; Description: "Install as Windows Service"; Types: full

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startafterinstall"; Description: "Start Pulsarr after installation"; GroupDescription: "Startup:"; Flags: checkedonce

[Files]
; Main application files (from extracted native build zip)
Source: "build\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: main
; Icon for uninstaller
Source: "pulsarr.ico"; DestDir: "{app}"; Flags: ignoreversion; Components: main

[Dirs]
; App directory permissions for non-admin user access
Name: "{app}"; Permissions: users-modify
; Create data directory with full permissions
Name: "{#MyAppDataDir}"; Permissions: users-full
Name: "{#MyAppDataDir}\db"; Permissions: users-full
Name: "{#MyAppDataDir}\logs"; Permissions: users-full

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\{#MyAppName} Web UI"; Filename: "http://localhost:3003"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
; Create .env from template if it doesn't exist
Filename: "cmd.exe"; Parameters: "/c if not exist ""{#MyAppDataDir}\.env"" copy ""{app}\.env.example"" ""{#MyAppDataDir}\.env"""; Flags: runhidden
; Install and start service
Filename: "{app}\pulsarr-service.exe"; Parameters: "install"; StatusMsg: "Installing Windows service..."; Flags: runhidden; Components: service
Filename: "{app}\pulsarr-service.exe"; Parameters: "start"; StatusMsg: "Starting Pulsarr service..."; Flags: runhidden; Components: service; Tasks: startafterinstall
; Start manually if not installing service
Filename: "{app}\{#MyAppExeName}"; Description: "Start {#MyAppName}"; Flags: nowait postinstall skipifsilent shellexec; Tasks: startafterinstall; Components: not service

[UninstallRun]
; Stop and uninstall service
Filename: "{app}\pulsarr-service.exe"; Parameters: "stop"; Flags: runhidden; RunOnceId: "StopService"
Filename: "{app}\pulsarr-service.exe"; Parameters: "uninstall"; Flags: runhidden; RunOnceId: "UninstallService"

[UninstallDelete]
; Clean up service wrapper logs if any
Type: files; Name: "{app}\pulsarr-service.wrapper.log"
Type: files; Name: "{app}\pulsarr-service.out.log"
Type: files; Name: "{app}\pulsarr-service.err.log"

[Code]
const
  CRLF = #13#10;

var
  DataDirPage: TInputDirWizardPage;
  DeleteDataCheckbox: TNewCheckBox;

procedure InitializeWizard;
begin
  { Add custom page for data directory selection (optional, for advanced users) }
  { For now, we use the default ProgramData\Pulsarr location }
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  { Stop existing service if running }
  if FileExists(ExpandConstant('{app}\pulsarr-service.exe')) then
  begin
    Exec(ExpandConstant('{app}\pulsarr-service.exe'), 'stop', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  StartBatContent: String;
  ServiceXmlContent: String;
  DataDir: String;
begin
  if CurStep = ssPostInstall then
  begin
    DataDir := ExpandConstant('{#MyAppDataDir}');

    { Create modified start.bat that sets dataDir }
    StartBatContent := '@echo off' + CRLF + 'cd /d "%~dp0"' + CRLF + CRLF + 'set "dataDir=' + DataDir + '"' + CRLF + CRLF + 'echo Running database migrations...' + CRLF + '.\bun.exe run --bun migrations\migrate.ts' + CRLF + CRLF + 'echo Starting Pulsarr...' + CRLF + '.\bun.exe run --bun dist\server.js %*' + CRLF + CRLF + 'echo.' + CRLF + 'echo Pulsarr has exited (code: %ERRORLEVEL%)' + CRLF + 'if not defined PULSARR_SERVICE pause' + CRLF;
    SaveStringToFile(ExpandConstant('{app}\start.bat'), StartBatContent, False);

    { Create modified pulsarr-service.xml that sets dataDir }
    ServiceXmlContent := '<service>' + CRLF + '  <id>pulsarr</id>' + CRLF + '  <name>Pulsarr</name>' + CRLF + '  <description>Plex watchlist tracker and notification center</description>' + CRLF + '  <executable>%BASE%\start.bat</executable>' + CRLF + '  <startmode>Automatic</startmode>' + CRLF + '  <log mode="none"/>' + CRLF + '  <stopparentprocessfirst>true</stopparentprocessfirst>' + CRLF + '  <env name="PULSARR_SERVICE" value="1"/>' + CRLF + '  <env name="dataDir" value="' + DataDir + '"/>' + CRLF + '  <onfailure action="restart" delay="10 sec"/>' + CRLF + '  <onfailure action="restart" delay="30 sec"/>' + CRLF + '  <resetfailure>1 hour</resetfailure>' + CRLF + '</service>' + CRLF;
    SaveStringToFile(ExpandConstant('{app}\pulsarr-service.xml'), ServiceXmlContent, False);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
  MsgResult: Integer;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{#MyAppDataDir}');
    if DirExists(DataDir) then
    begin
      MsgResult := MsgBox('Do you want to delete all Pulsarr data?' + CRLF + CRLF + 'This includes your configuration (.env) and database.' + CRLF + 'Location: ' + DataDir, mbConfirmation, MB_YESNO);
      if MsgResult = IDYES then
      begin
        DelTree(DataDir, True, True, True);
      end;
    end;
  end;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
var
  S: String;
begin
  S := '';

  if MemoDirInfo <> '' then
    S := S + MemoDirInfo + NewLine + NewLine;

  S := S + 'Data Directory:' + NewLine + Space + ExpandConstant('{#MyAppDataDir}') + NewLine + NewLine;

  if MemoComponentsInfo <> '' then
    S := S + MemoComponentsInfo + NewLine + NewLine;

  if MemoGroupInfo <> '' then
    S := S + MemoGroupInfo + NewLine + NewLine;

  if MemoTasksInfo <> '' then
    S := S + MemoTasksInfo + NewLine;

  Result := S;
end;
