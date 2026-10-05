/**
 * en-US 字典：与 zh-CN.js 逐域同构（key 结构必须一致）。
 * 纯数据模块：禁止 import vue / electron。
 * 插值 {name}；复数 {n, plural, =1 {..} other {..}} 为 vue-i18n 消息格式。
 */
export const enUS = {
  common: {
    untitled: 'Untitled',
    cancel: 'Cancel',
    confirm: 'OK',
    close: 'Close',
    settings: 'Settings',
    import: 'Import',
    add: 'Add',
    save: 'Save',
    discard: 'Discard',
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore Down',
    closeEsc: 'Close (Esc)',
    openFailedDetail: 'Failed to open: file could not be read or is corrupted',
    collapse: 'Collapse',
    name: 'Name',
    description: 'Description'
  },
  dialog: {
    confirmExit: 'Confirm Exit',
    unsavedExit: 'The file has unsaved changes. Exit anyway?',
    saveTo: 'Save file to...',
    saveAsTo: 'Save file as...',
    videoSaveAs: 'Save video to...',
    htmlSaveAs: 'Save web page to...',
    open: 'Open',
    pickWorldDir: 'Choose gallery folder'
  },
  menu: {
    newFile: 'New File',
    openFile: 'Open File',
    closeFile: 'Close File',
    saveAs: 'Save As...',
    export: 'Export',
    importOutline: 'Import from Outline...',
    addDir: 'Add Folder',
    refresh: 'Refresh View',
    backHome: 'Back to Home',
    worldTree: 'World Tree',
    openLocalFile: 'Open Local File',
    tour: 'Tutorial'
  },
  settings: {
    title: 'Settings',
    theme: 'Theme',
    followSystem: 'Auto',
    light: 'Light',
    dark: 'Dark',
    language: 'Language',
    keybindings: 'Shortcuts',
    keybindingConflict: 'Already used by "{name}"',
    pressNewCombo: 'Press new combination…',
    resetDefault: 'Reset',
    resetAll: 'Reset All to Default',
    gestures: 'Mouse Gestures',
    gestureNote: 'Mouse gestures cannot be customized yet'
  },
  keybinding: {
    names: {
      save: 'Save',
      undo: 'Undo',
      redo: 'Redo',
      delete: 'Delete',
      copy: 'Copy',
      paste: 'Paste',
      search: 'In-graph Search'
    },
    reject: {
      esc: 'Esc cancels recording and cannot be used as a shortcut',
      tab: 'Tab moves focus and cannot be used as a shortcut',
      f5: 'F5 is reserved (refresh guard) and cannot be used as a shortcut',
      ctrlR: 'Ctrl/⌘+R is reserved (refresh guard) and cannot be used as a shortcut',
      searchBare:
        'In-graph Search also triggers inside inputs; it requires at least one modifier key'
    }
  },
  editor: {
    nodeName: 'Node name',
    categoryPlaceholder: 'Category',
    newCategory: 'New category',
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
    descriptionOptional: 'Description (optional)',
    edgeNamePlaceholder: 'Link name (blank = unnamed); press Enter to confirm'
  },
  node: {
    category: 'Category',
    categoryPlaceholder: 'Choose a category',
    categoryNamePlaceholder: 'Category name',
    newCategory: 'Add category',
    size: 'Node Size',
    submit: 'Update Node'
  },
  edge: {
    submit: 'Update Link'
  },
  search: {
    placeholder: 'Search node names/descriptions',
    worldPlaceholder: 'Search all graphs: names / descriptions',
    noMatch: 'No matching nodes'
  },
  example: {
    nodeEdgeCount: '{nodes} nodes · {edges} links'
  },
  gesture: {
    createNode: 'New Node',
    marquee: 'Marquee Select',
    createLink: 'New Link',
    doubleClickBlank: 'Double-click blank area',
    shiftDrag: 'Shift+drag',
    linkLabel: '{modifier}+drag node'
  },
  tour: {
    welcomeTitle: 'Welcome to XKnowledge',
    welcomeDesc:
      'This is a 3D knowledge graph: nodes are concepts, links are relations, and categories are color-coded. A quick 1-minute tour of the essentials.',
    menuTitle: 'Menu',
    menuDesc:
      'New / open / close file, undo & redo, save & save as, export (image / HTML / recording), outline import and settings all live in this top-left menu.',
    toolbarTitle: 'Toolbar',
    toolbarDesc:
      'Delete node, delete link, and the panel toggle — click it to show or hide the right sidebar; clicking a node / link in the canvas brings it back automatically.',
    createNodeTitle: 'Create a node: double-click',
    createNodeDesc:
      'Double-click an empty spot on the canvas, type the node name inline, then pick a category (add new ones on the fly), a size tier and a description before pressing Enter.',
    linkTitle: 'Link nodes: Ctrl + drag',
    linkDesc:
      'Hold Ctrl (⌘ on macOS) and drag one node onto another, release, then type the link name inline (leave empty for an unnamed link); release on empty space to cancel.',
    navigateTitle: 'Canvas navigation',
    navigateDesc:
      'Drag with the left button to rotate, scroll to zoom, drag with the right button to pan; the Reset View button sits at the bottom of the right panel.',
    legendTitle: 'Legend',
    legendDesc:
      "One color dot per category — click a dot to toggle that category's visibility; dots appear as your categories grow.",
    panelTitle: 'Properties panel',
    panelDesc:
      'The "show link names on hover / small node labels" switches, focus mode, repulsion slider, graph description and reset view live here.',
    doneTitle: 'Start building',
    doneDesc:
      'Ctrl+F searches within the graph, Ctrl+S saves (with a 60-second autosave backup). Happy graphing!'
  },
  chart: {
    showEdgeName: 'Show link names on hover',
    showSmallLabels: 'Show small node labels',
    focusMode: 'Focus Mode',
    focusOff: 'Off',
    focusDim: 'Dim',
    focusHide: 'Hide',
    focusHops: 'Hops',
    repulsion: 'Repulsion',
    description: 'Description',
    view: 'View',
    exportPng: 'Export PNG',
    exportHtml: 'Export HTML',
    htmlExported: 'Interactive graph exported',
    emptyGraphNoExport: 'Nothing to export: the graph is empty',
    resetView: 'Reset View',
    exportVideo: 'Auto Orbit',
    recording: 'Recording…',
    screenRecord: 'Export Recording',
    stopRecord: 'Stop Recording',
    pauseRecording: 'Pause',
    resumeRecording: 'Resume',
    dragCard: 'Drag card',
    videoExported: 'Orbit video exported',
    videoUnsupported: 'Video recording is not supported in this environment',
    recordingSaved: 'Screen recording saved',
    recordingCancelled: 'Orbit recording cancelled',
    loadFailed: 'Failed to load chart data; close this window and reopen the file',
    newWindowFailed: 'Failed to open a new chart window',
    alreadyOpen: 'This file is already open in another window',
    openFailed: 'Failed to open',
    nothingToSave: 'No chart content to save',
    fileConflictHint:
      'File was modified by another window or external program; use "Save As" to keep your changes',
    exampleProtectedHint: 'Example files cannot be modified; choose another location to save',
    saveFailed: 'Failed to save',
    saveAsFailed: 'Save As failed',
    deleteNode: 'Delete Node',
    deleteEdge: 'Delete Link',
    editSider: 'Edit Panel',
    deletedSummary:
      'Deleted {nodes} {nodes, plural, =1 {node} other {nodes}} and {edges} {edges, plural, =1 {edge} other {edges}}',
    copiedSummary:
      'Copied {nodes} {nodes, plural, =1 {node} other {nodes}} and {edges} {edges, plural, =1 {edge} other {edges}}',
    pastedSummary:
      'Pasted {nodes} {nodes, plural, =1 {node} other {nodes}} and {edges} {edges, plural, =1 {edge} other {edges}}',
    pastedSummarySkipped:
      'Pasted {nodes} {nodes, plural, =1 {node} other {nodes}} and {edges} {edges, plural, =1 {edge} other {edges}} ({skipped} existing {skipped, plural, =1 {node} other {nodes}} skipped)',
    clipboardEmpty: 'No graph selection on the clipboard',
    pasteNothing: 'Nothing to paste (all nodes already exist and no new links)',
    searchHits: '{count} {count, plural, =1 {match} other {matches}}',
    init3dFailed: '3D view failed to initialize (GPU driver issue?); sidebar editing still works',
    navInfo3d:
      'Left: rotate  Right: pan  Wheel: zoom  Double-click: add node  Drag node: move  {modifier}+drag to node: link  Shift+drag: marquee',
    nodeLabelSep: ': '
  },
  world: {
    initFailed: '3D view failed to initialize (GPU driver issue?); world layer unavailable',
    superNodeLabel: '{title} ({count} nodes)',
    empty: 'World is empty',
    collapseAll: 'Collapse All',
    viewSettings: 'View Settings',
    repulsion: 'Repulsion',
    focus: 'Focus',
    sourceExample: 'Built-in example',
    sourceUser: 'User gallery',
    expand: 'Expand',
    openFullEdit: 'Open Full Editor',
    emptyDir: 'No graphs found in gallery folder: {dir}',
    loadFailed: 'Failed to load world index',
    expandFailed: 'Failed to expand: file could not be read or is corrupted',
    dirUpdated: 'Gallery folder updated',
    setDirFailed: 'Failed to set gallery folder',
    corruptSkipped: 'World index: skipped {count} corrupt {count, plural, =1 {file} other {files}}',
    expandedCount: 'Expanded {count}',
    nodeCountSource: '{count} nodes · Source: {source}',
    navInfo: 'Left: rotate  Wheel/Middle: zoom  Right: pan'
  },
  gallery: {
    title: 'Example Gallery',
    searchPlaceholder: 'Search examples: title / description / category',
    newBlankFile: 'New Blank File',
    noMatch: 'No matching examples',
    noExamples: 'No examples yet'
  },
  outline: {
    title: 'Import from Outline',
    hint1:
      'Paste a Markdown outline; it is parsed into a graph and appended to the current file (duplicate node names are skipped):',
    codeHeading: 'Heading',
    hintHeading: ' levels, indented lists (2 spaces per level), ',
    codeWikilink: 'Wikilink',
    hintWikilink: ' explicit links, ',
    hint2:
      'paragraphs under a structure line become the description of the node above; multiple H1s are chained to keep the graph connected.',
    textareaPlaceholder:
      '# Heading 1 (becomes category)\n## Heading 2\n- List item\n  - Sub item\nParagraphs become the description of the node above',
    nothingToImport: 'Nothing to import (all nodes already exist and no new links)',
    importSummary:
      'Will import {nodes} {nodes, plural, =1 {node} other {nodes}} and {edges} {edges, plural, =1 {edge} other {edges}}'
  },
  validation: {
    nodeNameRequired: 'Node name cannot be empty',
    categoryRequired: 'Choose or create a category for the node',
    duplicateNode: 'A node with this name already exists',
    edgeExists: 'A link between these nodes already exists'
  },
  error: {
    fileConflict:
      'File was modified by another window or external program; use "Save As" to avoid overwriting their changes',
    exampleProtected: 'Example files cannot be modified; save to another location',
    worldPathRejected: 'Invalid graph path',
    worldPathOutside: 'Path is outside the world tree gallery',
    worldDirRejected: 'Invalid gallery folder',
    incompleteChart: 'Incomplete file structure ({detail}); not a valid XKnowledge graph file',
    readFailed: 'Failed to read file',
    writeFailed: 'Failed to write file',
    notValidFile: 'File is corrupted or not a valid XKnowledge file',
    contentInvalid: 'File content is corrupted or malformed; cannot open',
    notOpenedGuard: 'This file was not opened or saved-as first; direct writes are not allowed',
    invalidExampleName: 'Invalid example file name',
    validation: {
      not_json_object: 'File content is not a JSON object',
      no_version: 'Missing version marker (version should be 2)',
      missing_nodes: 'Missing node data (nodes)',
      invalid_node_item: 'Node data contains invalid items',
      missing_links: 'Missing link data (links)',
      dangling_edge: 'Links reference non-existent nodes'
    }
  }
}
