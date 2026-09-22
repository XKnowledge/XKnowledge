; XKnowledge 安装器自定义脚本（package.json → build.nsis.include 引入）
; 设计依据：docs/superpowers/specs/2026-09-22-nsis-installer-design.md
; 本文件经 electron-builder 注入的时机早于模板页面宏展开（NsisTarget.js:599-605），
; 故头部的 MUI_LICENSEPAGE_CHECKBOX 能让许可页变为「勾选接受」形态。
;
; 结构说明：Var 声明、页面注册与函数必须都在 customPageAfterChangeDir 宏内——
; 卸载器编译 pass（BUILD_UNINSTALLER）不展开任何安装钩子宏，若 Var 在文件顶层
; 声明会成为死变量，触发 NSIS 6001 warning（electron-builder 把 warning 当 error）。
; 页面注册参照模板 multiUserUi.nsh 的 PageEx custom 模式。

!define MUI_LICENSEPAGE_CHECKBOX

; 幂等标记：勿用 $R0-$R9 寄存器——MUI2 内部页面函数在页面导航时会改写它们，
; 用户「上一步/返回」再前进会重置标记、导致按钮被反复加宽。自定义 Var 是
; 编译期独立槽位，不受影响。顶层声明不会触发 6001 死变量警告：customInstallMode
; 在安装器与卸载器两个编译 pass 中都展开并引用此变量。
Var /GLOBAL shortcutBtnWidened

; 「为谁安装」页（模板 multiUserUi.nsh）显示前加宽「下一步」按钮：
; 选择「为所有用户」时模板会给按钮叠 UAC 盾牌图标（multiUserUi.nsh:223 BCM_SETSHIELD），
; 中文按钮文字较宽，图标+文字的组合超出按钮客户区、盾牌向左溢出按钮边界。
; 在页面 Pre 时机按 DPI 计算加宽量、左扩按钮（右边缘不动，不挤「取消」按钮）。
; $shortcutBtnWidened 作幂等标记：用户「上一步」返回再前进时不重复加宽。
!macro customInstallMode
  ${If} $shortcutBtnWidened != "xk-widened"
    System::Call 'user32::GetDC(p 0) p .r1'
    System::Call 'gdi32::GetDeviceCaps(p r1, i 88) i .r1'   ; LOGPIXELSX
    System::Call 'user32::ReleaseDC(p 0, p r1)'
    IntOp $1 $1 / 4          ; 加宽量 = 盾牌图标宽(SM_CXSMICON = dpi/6) + 余量
    ; 布局事实（2026-09-22 子控件枚举实测，125% DPI）：「上一步」与「下一步」
    ; 零间隙相邻（back 右缘 == next 左缘），「取消」紧邻「下一步」右侧。
    ; 控件 ID（实测推翻 multiUserUi.nsh:197 注释「0 is back」）：item 0 是内层
    ; 页面对话框（类 #32770，563×263 覆盖内容区），item 3 才是「上一步」
    ; （IDC_BACK），item 1 = 「下一步」。此前误用 item 0：整个内层对话框被
    ; 左移，真「上一步」原地不动，「下一步」左移加宽 30px 直接压在其上——
    ; 两按钮重叠 ~30px 的根因。
    ; 方案：「下一步」右缘不动、左移 widen 加宽；「上一步」等量加宽并左移
    ; 4×widen——首 1×widen 让出「下一步」的左移空间，其余 3×widen 向左
    ; 拉开间距（净间距 2×widen ≈ 60px；作者 2026-09-22 要求向左移并加大
    ; 间距），两按钮等宽。
    ; —— 「上一步」（item 3 = IDC_BACK）：左移 4×widen，宽 +widen ——
    GetDlgItem $0 $hwndParent 3
    System::Call '*(i, i, i, i) p .r2'
    System::Call 'user32::GetWindowRect(p $0, p r2)'
    System::Call '*$2(i .r3, i .r4, i .r5, i .r6)'
    System::Free $2
    IntOp $7 $5 - $3
    IntOp $7 $7 + $1
    IntOp $8 $6 - $4
    System::Call '*(i r3, i r4) p .r2'
    System::Call 'user32::ScreenToClient(p $hwndParent, p r2)'
    System::Call '*$2(i .r3, i .r4)'
    System::Free $2
    IntOp $3 $3 - $1
    IntOp $3 $3 - $1
    IntOp $3 $3 - $1
    IntOp $3 $3 - $1
    System::Call 'user32::MoveWindow(p $0, i r3, i r4, i r7, i r8, b 1)'
    ; —— 「下一步」（item 1）：左移 widen、加宽（右缘不动） ——
    GetDlgItem $0 $hwndParent 1
    System::Call '*(i, i, i, i) p .r2'
    System::Call 'user32::GetWindowRect(p $0, p r2)'
    System::Call '*$2(i .r3, i .r4, i .r5, i .r6)'
    System::Free $2
    IntOp $7 $5 - $3
    IntOp $7 $7 + $1
    IntOp $8 $6 - $4
    System::Call '*(i r3, i r4) p .r2'
    System::Call 'user32::ScreenToClient(p $hwndParent, p r2)'
    System::Call '*$2(i .r3, i .r4)'
    System::Free $2
    IntOp $3 $3 - $1
    System::Call 'user32::MoveWindow(p $0, i r3, i r4, i r7, i r8, b 1)'
    StrCpy $shortcutBtnWidened "xk-widened"
  ${EndIf}
!macroend

; .onInit 时机初始化为「勾选」：静默安装（/S）不经过自定义页，
; 以此为默认，保证静默安装仍创建全部快捷方式（1 = BST_CHECKED）
; （变量声明位于下方 customPageAfterChangeDir 宏内，其展开点
;  assistedInstaller.nsh:43 早于本宏的展开点 installer.nsi:79，编译顺序成立）
!macro customInit
  StrCpy $shortcutDesktopState "1"
  StrCpy $shortcutStartMenuState "1"
  StrCpy $shortcutPageShown "0"
!macroend

; 目录页之后、安装页之前的自定义页：快捷方式勾选（默认全勾）
!macro customPageAfterChangeDir
  Var /GLOBAL shortcutDesktopState
  Var /GLOBAL shortcutStartMenuState
  Var /GLOBAL shortcutDesktopCheckbox
  Var /GLOBAL shortcutStartMenuCheckbox
  Var /GLOBAL shortcutPageShown

  PageEx custom
    PageCallbacks XKShortcutPageCreate
    Caption " "
  PageExEnd

  Function XKShortcutPageCreate
    StrCpy $shortcutPageShown "1"
    !insertmacro MUI_HEADER_TEXT "快捷方式" "选择要创建的快捷方式"
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0u 0u 300u 20u "选择要创建的快捷方式："
    Pop $0
    ${NSD_CreateCheckbox} 10u 30u 280u 20u "创建桌面快捷方式"
    Pop $shortcutDesktopCheckbox
    ${NSD_Check} $shortcutDesktopCheckbox
    ${NSD_OnClick} $shortcutDesktopCheckbox XKShortcutDesktopClick
    ${NSD_CreateCheckbox} 10u 50u 280u 20u "创建开始菜单快捷方式"
    Pop $shortcutStartMenuCheckbox
    ${NSD_Check} $shortcutStartMenuCheckbox
    ${NSD_OnClick} $shortcutStartMenuCheckbox XKShortcutStartMenuClick
    nsDialogs::Show
    ; 勿在 nsDialogs::Show 之后读控件状态：实测此时控件句柄已失效（SendMessage
    ; 对无效窗口返回 0，安装段误判为全部未勾选、删光快捷方式——xk-install.log
    ; pageShown=1 且两个 state=0 所证）。状态由上方 OnClick 回调在点击时刻实时
    ; 写入（此时控件必然存活）；无人点击则保持 customInit 的默认「勾选」。
  FunctionEnd

  Function XKShortcutDesktopClick
    Pop $1   ; 回调参数：控件 HWND（点击来源已知，弃用；pop 以平衡栈）
    ${NSD_GetState} $shortcutDesktopCheckbox $shortcutDesktopState
  FunctionEnd

  Function XKShortcutStartMenuClick
    Pop $1
    ${NSD_GetState} $shortcutStartMenuCheckbox $shortcutStartMenuState
  FunctionEnd
!macroend

; 安装尾段：模板已无条件创建快捷方式（installSection.nsh:68-69），
; 此处按用户勾选删除未勾选项；Delete 对不存在的文件无害
!macro customInstall
  ${IfNot} $shortcutDesktopState == 1
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  ${EndIf}
  ${IfNot} $shortcutStartMenuState == 1
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  ${EndIf}
  ; 模板在 customInstall 之前已把 $launchLink 定为开始菜单 lnk（installSection.nsh:71-75），
  ; 若上方删除了该 lnk（用户取消勾选开始菜单），完成页「运行 XKnowledge」会从
  ; 已删除的快捷方式启动而静默失败——回退为直接指向应用 exe
  ${IfNot} ${FileExists} "$launchLink"
    StrCpy $launchLink "$appExe"
  ${EndIf}
  ; —— 临时诊断日志：取证快捷方式勾选与完成页运行问题，定位后整段移除 ——
  FileOpen $R8 "$INSTDIR\xk-install.log" w
  ${If} $R8 != ""
    StrCpy $R7 "outer"
    ${If} ${UAC_IsInnerInstance}
      StrCpy $R7 "inner"
    ${EndIf}
    ${If} ${UAC_IsAdmin}
      StrCpy $R7 "$R7+admin"
    ${EndIf}
    FileWrite $R8 "process=$R7$\r$\n"
    FileWrite $R8 "pageShown=$shortcutPageShown$\r$\n"
    FileWrite $R8 "desktopState=$shortcutDesktopState$\r$\n"
    FileWrite $R8 "startMenuState=$shortcutStartMenuState$\r$\n"
    FileWrite $R8 "launchLink=$launchLink$\r$\n"
    FileWrite $R8 "newStartMenuLink=$newStartMenuLink$\r$\n"
    StrCpy $R7 "0"
    ${If} ${FileExists} "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
      StrCpy $R7 "1"
    ${EndIf}
    FileWrite $R8 "smLnkExistsAfter=$R7$\r$\n"
    StrCpy $R7 "0"
    ${If} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
      StrCpy $R7 "1"
    ${EndIf}
    FileWrite $R8 "desktopLnkExistsAfter=$R7$\r$\n"
    FileClose $R8
  ${EndIf}
!macroend
