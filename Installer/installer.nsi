;--------------------------------
;Plugins
;https://nsis.sourceforge.io/ApplicationID_plug-in
;https://nsis.sourceforge.io/ShellExecAsUser_plug-in
;https://nsis.sourceforge.io/NsProcess_plugin
;https://nsis.sourceforge.io/Inetc_plug-in

!addplugindir "Plugins\x86-unicode"

;--------------------------------
;Version
    !include "version_define.nsh"

    !define PRODUCT_VERSION ${PRODUCT_VERSION_FROM_FILE}
    !define VERSION ${PRODUCT_VERSION_FROM_FILE}

    VIProductVersion "${PRODUCT_VERSION}"
    VIFileVersion "${VERSION}"
    VIAddVersionKey "FileVersion" "${VERSION}"
    VIAddVersionKey "ProductName" "Neon"
    VIAddVersionKey "ProductVersion" "${PRODUCT_VERSION}"
    VIAddVersionKey "LegalCopyright" "Neon (MIT licensed, see LICENSE)"
    VIAddVersionKey "FileDescription" "Neon - your VRChat companion"

;--------------------------------
;Include Modern UI

    !include "MUI2.nsh"
    !include "FileFunc.nsh"
    !include "WordFunc.nsh"
    !insertmacro VersionCompare
    !include "LogicLib.nsh"

;--------------------------------
;General

    SetCompressor /SOLID lzma
    SetCompressorDictSize 16
    Unicode True
    Name "Neon"
    OutFile "Neon_Setup_x64.exe"
    InstallDir "$LOCALAPPDATA\Programs\Neon"
    InstallDirRegKey HKCU "Software\Neon" "InstallDir"
    RequestExecutionLevel user
    ShowInstDetails show

;--------------------------------
;Variables

    VAR upgradeInstallation
    VAR legacyDir

;--------------------------------
;Interface Settings

    !define MUI_ABORTWARNING

;--------------------------------
;Icons

    !define MUI_ICON "../images/Neon.ico"
    !define MUI_UNICON "../images/Neon.ico"

;--------------------------------
;Pages

    !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfUpgrade
    !insertmacro MUI_PAGE_LICENSE "..\LICENSE"

    !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfUpgrade
    !insertmacro MUI_PAGE_DIRECTORY

    !insertmacro MUI_PAGE_INSTFILES

    ;------------------------------
    ; Finish Page

    ; Checkbox to launch Neon.
    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_TEXT "Launch Neon"
    !define MUI_FINISHPAGE_RUN_FUNCTION launchNeon

    ; Checkbox to create desktop shortcut.
    !define MUI_FINISHPAGE_SHOWREADME
    !define MUI_FINISHPAGE_SHOWREADME_TEXT "Create desktop shortcut"
    !define MUI_FINISHPAGE_SHOWREADME_FUNCTION createDesktopShortcut

    !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfUpgrade
    !insertmacro MUI_PAGE_FINISH

    !insertmacro MUI_UNPAGE_CONFIRM
    !insertmacro MUI_UNPAGE_INSTFILES
    !insertmacro MUI_UNPAGE_FINISH

;--------------------------------
;Languages

    !insertmacro MUI_LANGUAGE "English"

;--------------------------------
;Macros

;--------------------------------
;Functions

Function SkipIfUpgrade
    StrCmp $upgradeInstallation 0 noUpgrade
        Abort
    noUpgrade:
FunctionEnd

Function .onInit
    StrCpy $upgradeInstallation 0

    StrCpy $legacyDir ""
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Neon" "UninstallString"
    StrCmp $R0 "" notInstalled
        StrCpy $upgradeInstallation 1
    notInstalled:

    ; An older install from before the rename: remember where it lives, it is replaced below
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\VRCX" "UninstallString"
    StrCmp $R0 "" noLegacy
        ReadRegStr $legacyDir HKLM "Software\VRCX" "InstallDir"
        StrCpy $upgradeInstallation 1
    noLegacy:

    ; Never replace a newer install with an older installer
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Neon" "DisplayVersion"
    StrCmp $R0 "" noVersionCheck
        ${VersionCompare} "$R0" "${VERSION}" $R2
        ${If} $R2 = 1
            MessageBox MB_YESNO|MB_ICONQUESTION "A newer Neon ($R0) is already installed. Install the older ${VERSION} anyway?" /SD IDNO IDYES noVersionCheck
            Abort
        ${EndIf}
    noVersionCheck:

    StrCpy $R3 0
    ; If Neon is already running, display a warning message
    loop:
    nsProcess::_FindProcess "Neon.exe"
    Pop $R1
    ${If} $R1 <> 0
        nsProcess::_FindProcess "VRCX.exe"
        Pop $R1
    ${EndIf}
    ${If} $R1 = 0
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "Neon is still running. $\n$\nClick `OK` to kill the running process or `Cancel` to cancel this installer." /SD IDOK IDCANCEL cancel
            nsExec::ExecToStack "taskkill /IM Neon.exe"
            nsExec::ExecToStack "taskkill /IM VRCX.exe"
    ${Else}
        Goto done
    ${EndIf}
    Sleep 1000
    IntOp $R3 $R3 + 1
    ${If} $R3 > 20
        ; still running (for example it only hid itself to the tray), close it hard
        nsExec::ExecToStack "taskkill /F /IM Neon.exe"
    ${EndIf}
    Goto loop

    cancel:
        Abort
    done:
FunctionEnd

Function .onInstSuccess
    ${If} $upgradeInstallation = 1
        Call launchNeon
    ${EndIf}
FunctionEnd

Function createDesktopShortcut
    CreateShortcut "$DESKTOP\Neon.lnk" "$INSTDIR\Neon.exe"
FunctionEnd

Function launchNeon
    SetOutPath $INSTDIR
    ShellExecAsUser::ShellExecAsUser "" "$INSTDIR\Neon.exe" ""
FunctionEnd

;--------------------------------
;Installer Sections

Section "Install" SecInstall
    ; remove an install from before the rename (the program files only, your data is untouched)
    StrCmp $legacyDir "" noLegacyCleanup
        DetailPrint "Replacing the previous version..."
        IfFileExists "$legacyDir\Uninstall.exe" 0 +3
            ExecWait '"$legacyDir\Uninstall.exe" /S _?=$legacyDir'
            Delete "$legacyDir\Uninstall.exe"
        RMDir /r "$legacyDir"
        DeleteRegKey HKLM "Software\VRCX"
        DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\VRCX"
    noLegacyCleanup:

    IfFileExists "$INSTDIR\Uninstall.exe" 0 noOwnUninstall
        DetailPrint "Uninstall previous version..."
        ExecWait '"$INSTDIR\Uninstall.exe" /S _?=$INSTDIR'
        Delete $INSTDIR\Uninstall.exe
        Goto afterUpgrade
    noOwnUninstall:
    StrCmp $upgradeInstallation 1 afterUpgrade

    inetc::get "https://aka.ms/vs/17/release/vc_redist.x64.exe" $TEMP\vcredist_x64.exe
    ExecWait "$TEMP\vcredist_x64.exe /install /quiet /norestart"
    Delete "$TEMP\vcredist_x64.exe"

    afterUpgrade:

    ; Safety copy of your data (history, favorites, settings). The data itself is never touched.
    ; The app moves an older data folder to its new name by itself the first time it starts.
    IfFileExists "$APPDATA\VRCX\*.*" 0 noOldBackup
        DetailPrint "Backing up your data to Documents\Neon-backups ..."
        nsExec::ExecToLog 'robocopy "$APPDATA\VRCX" "$DOCUMENTS\Neon-backups\data-before-rename" /E /R:1 /W:1 /NFL /NDL /NJH /NJS'
        Pop $0
    noOldBackup:

    SetOutPath "$INSTDIR"

    File /r /x *.log /x *.pdb "..\build\Cef\*.*"

    WriteRegStr HKCU "Software\Neon" "InstallDir" $INSTDIR
    WriteUninstaller "$INSTDIR\Uninstall.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Neon" "DisplayName" "Neon"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Neon" "Publisher" "Neon"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Neon" "DisplayVersion" "${VERSION}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Neon" "DisplayArch" "x64"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Neon" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Neon" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Neon" "DisplayIcon" "$\"$INSTDIR\Neon.ico$\""

    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKCU  "Software\Microsoft\Windows\CurrentVersion\Uninstall\Neon" "EstimatedSize" "$0"

    ${GetParameters} $R2
    ${GetOptions} $R2 /SKIP_SHORTCUT= $3
    StrCmp $3 "true" noShortcut
        Delete "$SMPROGRAMS\VRCX.lnk"
        Delete "$DESKTOP\VRCX.lnk"
        Delete "$SMPROGRAMS\Aurora.lnk"
        Delete "$DESKTOP\Aurora.lnk"
        CreateShortCut "$SMPROGRAMS\Neon.lnk" "$INSTDIR\Neon.exe"
        ApplicationID::Set "$SMPROGRAMS\Neon.lnk" "Neon"
        CreateShortCut "$DESKTOP\Neon.lnk" "$INSTDIR\Neon.exe"
    noShortcut:

    WriteRegStr HKCU "Software\Classes\vrcx" "" "URL:vrcx"
    WriteRegStr HKCU "Software\Classes\vrcx" "FriendlyTypeName" "Neon"
    WriteRegStr HKCU "Software\Classes\vrcx" "URL Protocol" ""
    WriteRegExpandStr HKCU "Software\Classes\vrcx\DefaultIcon" "" "$INSTDIR\Neon.ico"
    WriteRegStr HKCU "Software\Classes\vrcx\shell" "" "open"
    WriteRegStr HKCU "Software\Classes\vrcx\shell\open" "FriendlyAppName" "Neon"
    WriteRegStr HKCU "Software\Classes\vrcx\shell\open\command" "" '"$INSTDIR\Neon.exe" /uri="%1" /params="%2 %3 %4"'
SectionEnd

;--------------------------------
;Uninstaller Section

Section "Uninstall"
    ; If Neon is already running, display a warning message and exit
    StrCpy $1 "Neon.exe"
    nsProcess::_FindProcess "$1"
    Pop $R1
    ${If} $R1 = 0
        MessageBox MB_OK|MB_ICONEXCLAMATION "Neon is still running. Cannot uninstall this software.$\nPlease close Neon and try again." /SD IDOK
        Abort
    ${EndIf}

    RMDir /r "$INSTDIR"

    DeleteRegKey HKCU "Software\Neon"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Neon"
    DeleteRegKey HKCU "Software\Classes\vrcx"

    ${IfNot} ${Silent}
        Delete "$SMPROGRAMS\VRCX.lnk"
        Delete "$DESKTOP\VRCX.lnk"
        Delete "$SMPROGRAMS\Neon.lnk"
        Delete "$DESKTOP\Neon.lnk"
        Delete "$SMPROGRAMS\Aurora.lnk"
        Delete "$DESKTOP\Aurora.lnk"
    ${EndIf}
SectionEnd