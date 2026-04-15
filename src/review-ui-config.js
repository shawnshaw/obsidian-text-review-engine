const { READFLOW_UI_TEMPLATES } = require('./readflow-ui-templates');

const REVIEW_VIEW_BLUEPRINT = {
  templateRefs: {
    shell: READFLOW_UI_TEMPLATES.workbenchShell.id,
    inspector: READFLOW_UI_TEMPLATES.knowledgeInspector.id,
    maintenance: READFLOW_UI_TEMPLATES.chapterMaintenancePane.id,
  },
  workspace: {
    review: {
      title: '文本审校流程',
      subtitleReady: '输入文本、执行审校、浏览问题，并在右侧查看当前问题的详细判断。',
      subtitleEmpty: '适合推文、短文案、政务风格短文本。建议粘贴最终待发布版本。',
    },
    maintain: {
      title: '审校标准维护',
      subtitle: '标准管理已经收回到审校页里。左侧仍是待审校文本，右侧维护规则、备份和 Prompt，改完直接应用即可。',
    },
  },
  toolbar: {
    sharedPrimary: [
      { id: 'toggleStandardsManager', labelWhenFalse: '标准管理', labelWhenTrue: '返回审校', style: 'chip', activeWhenTrue: true },
      { id: 'applyChanges', label: '应用更改', style: 'primaryButton' },
    ],
    reviewSecondary: [
      { id: 'importSelection', label: '导入选中', style: 'chip' },
      { id: 'importFullNote', label: '导入全文', style: 'chip' },
      { id: 'openWorkbenchNote', label: '打开审校 Note', style: 'chip' },
      { id: 'copyJson', label: '复制 JSON', style: 'icon', icon: 'copy' },
    ],
    maintainSecondary: [
      { id: 'openStandardsCenter', label: '标准中心', style: 'chip' },
      { id: 'reloadRules', label: '重载规则', style: 'chip' },
      { id: 'reloadPrompts', label: '重载 Prompt', style: 'chip' },
    ],
  },
  sidebar: {
    review: {
      title: '审校概览',
      subtitle: '先看整体结论，再决定是直接修改、人工复核，还是继续发布。',
      distributionTitle: '问题筛选',
      dimensionsTitle: '当前维度',
    },
    maintain: {
      title: '治理概览',
      subtitle: '先维护规则底盘，再逐步增加 Prompt。',
      directoryTitle: '当前目录',
      principlesTitle: '维护原则',
    },
  },
};

module.exports = {
  REVIEW_VIEW_BLUEPRINT,
};
