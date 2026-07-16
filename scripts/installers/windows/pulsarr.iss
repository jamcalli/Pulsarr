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
; Code goes to Program Files (admin-only). User data stays in {#MyAppDataDir}.
DefaultDirName={autopf}\{#MyAppName}
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

[InstallDelete]
; Clear the code dirs before copying so files removed between releases can't linger.
Type: filesandordirs; Name: "{app}\dist"
Type: filesandordirs; Name: "{app}\node_modules"
Type: filesandordirs; Name: "{app}\migrations"
Type: filesandordirs; Name: "{app}\packages"
; Shipped by older installers; now excluded from [Files]
Type: files; Name: "{app}\README.txt"
; Leftover lock probe from an interrupted run
Type: files; Name: "{app}\bun.exe.locktest"
; Older installers put code in the data dir; remove those copies (keep .env, db, logs).
Type: filesandordirs; Name: "{#MyAppDataDir}\dist"
Type: filesandordirs; Name: "{#MyAppDataDir}\node_modules"
Type: filesandordirs; Name: "{#MyAppDataDir}\migrations"
Type: filesandordirs; Name: "{#MyAppDataDir}\packages"
Type: files; Name: "{#MyAppDataDir}\bun.exe"
Type: files; Name: "{#MyAppDataDir}\start.bat"
Type: files; Name: "{#MyAppDataDir}\pulsarr-service.exe"
Type: files; Name: "{#MyAppDataDir}\pulsarr-service.xml"
Type: files; Name: "{#MyAppDataDir}\pulsarr-service.wrapper.log"
Type: files; Name: "{#MyAppDataDir}\pulsarr-service.out.log"
Type: files; Name: "{#MyAppDataDir}\pulsarr-service.err.log"
Type: files; Name: "{#MyAppDataDir}\.env.example"
Type: files; Name: "{#MyAppDataDir}\pulsarr.ico"
Type: files; Name: "{#MyAppDataDir}\README.txt"
Type: files; Name: "{#MyAppDataDir}\bun.exe.locktest"

[Files]
; Main application files (from extracted native build zip).
; Exclude zip-flow files: installer users update by re-running the installer.
Source: "build\*"; DestDir: "{app}"; Excludes: "update.bat,README.txt"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: main
; Icon for uninstaller
Source: "pulsarr.ico"; DestDir: "{app}"; Flags: ignoreversion; Components: main

[Dirs]
; No user-write on {app}: the LocalSystem service runs this code. Only data below.
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
; WinSW stop can return before the process tree exits
Filename: "cmd.exe"; Parameters: "/c timeout /t 2 /nobreak"; Flags: runhidden; RunOnceId: "StopSettle"
Filename: "{app}\pulsarr-service.exe"; Parameters: "uninstall"; Flags: runhidden; RunOnceId: "UninstallService"

[UninstallDelete]
; Clean up service wrapper logs if any
Type: files; Name: "{app}\pulsarr-service.wrapper.log"
Type: files; Name: "{app}\pulsarr-service.out.log"
Type: files; Name: "{app}\pulsarr-service.err.log"

[Code]
const
  CRLF = #13#10;

procedure InitializeWizard;
begin
  { Relocate legacy data-dir installs to the default; keep a custom directory. }
  if CompareText(WizardDirValue, ExpandConstant('{#MyAppDataDir}')) = 0 then
    WizardForm.DirEdit.Text := ExpandConstant('{autopf}\{#MyAppName}');
end;

{ A locked bun.exe means Pulsarr is still running. Returns '' when the
  file is absent or free. }
function CheckBunLocked(BunPath: String): String;
var
  ProbePath: String;
  I, J: Integer;
begin
  Result := '';
  if not FileExists(BunPath) then
    Exit;
  ProbePath := BunPath + '.locktest';
  { A stale probe file from an interrupted run blocks the rename below }
  DeleteFile(ProbePath);
  for I := 1 to 5 do
  begin
    if RenameFile(BunPath, ProbePath) then
    begin
      { Retry the restore; AV scanners can briefly lock a renamed file }
      for J := 1 to 5 do
      begin
        if RenameFile(ProbePath, BunPath) then
          Exit;
        Sleep(1000);
      end;
      Result := 'Setup could not restore bun.exe. Rename ' + ProbePath + ' back to bun.exe, then run Setup again.';
      Exit;
    end;
    Sleep(2000);
  end;
  Result := 'Pulsarr appears to be running. Stop the Pulsarr service or close the Pulsarr window, then run Setup again.';
end;

{ True when the registered pulsarr service runs from the data dir. The
  registry is admin-writable only, so user-writable files can't spoof this. }
function LegacyServiceInDataDir(): Boolean;
var
  ImagePath, DataDir: String;
begin
  Result := False;
  if not RegQueryStringValue(HKLM, 'SYSTEM\CurrentControlSet\Services\pulsarr', 'ImagePath', ImagePath) then
    Exit;
  if (ImagePath <> '') and (ImagePath[1] = '"') then
    Delete(ImagePath, 1, 1);
  DataDir := ExpandConstant('{#MyAppDataDir}\');
  Result := CompareText(Copy(ImagePath, 1, Length(DataDir)), DataDir) = 0;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';

  { Old install ran the service from the data dir; remove it first or winsw
    install name-clashes and the old bun.exe stays locked. Go through the
    SCM by service name: the data dir is user-writable, so binaries there
    must never run elevated. }
  if (CompareText(ExpandConstant('{#MyAppDataDir}'), ExpandConstant('{app}')) <> 0) and LegacyServiceInDataDir() then
  begin
    Exec(ExpandConstant('{sys}\sc.exe'), 'stop pulsarr', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(2000);
    Exec(ExpandConstant('{sys}\sc.exe'), 'delete pulsarr', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    { 1060 = never registered (compact installs). Anything else leaves a stale
      entry that InstallDelete would orphan and the winsw install below would
      collide with. }
    if (ResultCode <> 0) and (ResultCode <> 1060) then
    begin
      Result := 'Setup could not remove the old Pulsarr service (error ' + IntToStr(ResultCode) + '). Close the Services console if it is open, then run Setup again.';
      Exit;
    end;
    Sleep(1000);
  end;

  if FileExists(ExpandConstant('{app}\pulsarr-service.exe')) then
  begin
    Exec(ExpandConstant('{app}\pulsarr-service.exe'), 'stop', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    { WinSW stop can return before the process tree exits }
    Sleep(2000);
  end;

  { Abort here, before InstallDelete wipes the code dirs with no rollback.
    Check the legacy data-dir copy too: a compact install never registered
    the service, so nothing above stops an instance still running there. }
  Result := CheckBunLocked(ExpandConstant('{app}\bun.exe'));
  if (Result = '') and (CompareText(ExpandConstant('{#MyAppDataDir}'), ExpandConstant('{app}')) <> 0) then
    Result := CheckBunLocked(ExpandConstant('{#MyAppDataDir}\bun.exe'));
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
