; XKnowledge 安装器自定义脚本（package.json → build.nsis.include 引入）
; 设计依据：docs/superpowers/specs/2026-09-22-nsis-installer-design.md
; 本文件经 electron-builder 注入的时机早于模板页面宏展开（NsisTarget.js:599-605），
; 故头部的 MUI_LICENSEPAGE_CHECKBOX 能让许可页变为「勾选接受」形态。
;
; 结构说明：引用了宏内 Var 的函数、页面注册必须在 customPageAfterChangeDir
; 等宏内——卸载器编译 pass（BUILD_UNINSTALLER）不展开安装钩子宏，若 Var 在
; 文件顶层声明会成为死变量，触发 NSIS 6001 warning（electron-builder 把
; warning 当 error）；而钩子宏的展开点多在 Section/Function 体内，函数体内
; 不能再嵌套 Function 定义。只引用内置变量/寄存器的函数（如 XKGuiInit）可
; 以放文件顶层。页面注册参照模板 multiUserUi.nsh 的 PageEx custom 模式。

!define MUI_LICENSEPAGE_CHECKBOX

; 向导按钮布局时机：MUI2 在 .onGUIInit 末尾 Call 本 define 指向的函数
; （Interface.nsh MUI_FUNCTION_GUIINIT），此时外层对话框已创建、三个向导
; 按钮（上一步/下一步/取消）已随对话框模板定位，且早于第一页（许可页）
; 显示——布局一次生效、全程一致。每进程恰好触发一次，天然幂等。
; 卸载器 pass 不受影响：un.onGUIInit 只读 MUI_CUSTOMFUNCTION_UNGUIINIT。
!define MUI_CUSTOMFUNCTION_GUIINIT XKGuiInit

; 向导按钮布局（作者 2026-09-23 要求「翻页式」对齐）：「上一步」移到左下角、
; 与客户区左缘对齐；「下一步」「取消」保持在右下角相邻。XKGuiInit 由上方
; MUI_CUSTOMFUNCTION_GUIINIT 挂入 .onGUIInit，早于全部页面、每进程恰好一次。
; （此前挂在「为谁安装」页 Pre——customInstallMode 宏的展开点在页面 Pre
; 函数体内，只能放内联语句：许可页仍显示默认布局，且页面 Pre 会随「上一
; 步」返回再前进反复触发，需自定义 Var 作幂等标记。GUIINIT 时机两个问题
; 一并消除，customInstallMode 宏随之撤销。）
; 「下一步」仍按 DPI 加宽（右缘不动、左移）：「为谁安装」页选择「为所有
; 用户」时模板给按钮叠 UAC 盾牌图标（multiUserUi.nsh:223 BCM_SETSHIELD），
; 中文按钮文字较宽，图标+文字的组合超出按钮客户区、盾牌向左溢出按钮边界。
; 「上一步」同步等量加宽保持两按钮等宽；左缘取「取消」的右边距（客户区宽
; − 取消右缘），与右下角「取消」的右边距左右对称。
; 控件 ID（2026-09-22 子控件枚举实测，推翻 multiUserUi.nsh:197 注释
; 「0 is back」）：item 0 是内层页面对话框（类 #32770，覆盖内容区），
; item 3 =「上一步」（IDC_BACK），item 1 =「下一步」，item 2 =「取消」。
; Function 定义在文件顶层（下方「函数必须在宏内」的限制只针对引用了宏内
; Var 的函数）：本函数只引用内置 $hwndParent 与 $0-$9 寄存器，安装器与
; 卸载器两个编译 pass 都能编译；卸载器 pass 中无人调用，是无害死代码，
; 未引用的 Function 不触发 NSIS 6001（该警告仅针对 Var）。
Function XKGuiInit
  System::Call 'user32::GetDC(p 0) p .r1'
  System::Call 'gdi32::GetDeviceCaps(p r1, i 88) i .r1'   ; LOGPIXELSX
  System::Call 'user32::ReleaseDC(p 0, p r1)'
  IntOp $1 $1 / 4          ; 加宽量 = 盾牌图标宽(SM_CXSMICON = dpi/6) + 余量
  ; —— 客户区宽（RECT 缓冲须 16 字节：left/top 恒 0，right = 宽） ——
  System::Call '*(i, i, i, i) p .r2'
  System::Call 'user32::GetClientRect(p $hwndParent, p r2)'
  System::Call '*$2(i, i, i .r9, i)'
  System::Free $2
  ; —— 「取消」（item 2）右缘 → 左边距 $6 ——
  GetDlgItem $0 $hwndParent 2
  System::Call '*(i, i, i, i) p .r2'
  System::Call 'user32::GetWindowRect(p $0, p r2)'
  System::Call '*$2(i .r3, i .r4, i .r5, i .r8)'
  System::Free $2
  System::Call '*(i r5, i r4) p .r2'
  System::Call 'user32::ScreenToClient(p $hwndParent, p r2)'
  System::Call '*$2(i .r5, i .r4)'
  System::Free $2
  IntOp $6 $9 - $5
  ; —— 「上一步」（item 3）：左缘 = 左边距，宽 +widen，top/高不变 ——
  GetDlgItem $0 $hwndParent 3
  System::Call '*(i, i, i, i) p .r2'
  System::Call 'user32::GetWindowRect(p $0, p r2)'
  System::Call '*$2(i .r3, i .r4, i .r5, i .r8)'
  System::Free $2
  IntOp $7 $5 - $3
  IntOp $7 $7 + $1
  IntOp $8 $8 - $4
  System::Call '*(i r3, i r4) p .r2'
  System::Call 'user32::ScreenToClient(p $hwndParent, p r2)'
  System::Call '*$2(i .r3, i .r4)'
  System::Free $2
  StrCpy $3 $6
  System::Call 'user32::MoveWindow(p $0, i r3, i r4, i r7, i r8, b 1)'
  ; —— 「下一步」（item 1）：左移 widen、加宽（右缘不动，不挤「取消」） ——
  GetDlgItem $0 $hwndParent 1
  System::Call '*(i, i, i, i) p .r2'
  System::Call 'user32::GetWindowRect(p $0, p r2)'
  System::Call '*$2(i .r3, i .r4, i .r5, i .r8)'
  System::Free $2
  IntOp $7 $5 - $3
  IntOp $7 $7 + $1
  IntOp $8 $8 - $4
  System::Call '*(i r3, i r4) p .r2'
  System::Call 'user32::ScreenToClient(p $hwndParent, p r2)'
  System::Call '*$2(i .r3, i .r4)'
  System::Free $2
  IntOp $3 $3 - $1
  System::Call 'user32::MoveWindow(p $0, i r3, i r4, i r7, i r8, b 1)'
FunctionEnd

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
!macroend
