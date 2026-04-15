const READFLOW_UI_TEMPLATES = {
  workbenchShell: {
    id: 'readflow_workbench_shell_v1',
    label: 'ReadFlow Workbench Shell',
    purpose: '用于审校、治理、知识操作类工作台的统一壳层。',
    layout: {
      topBar: 'quiet_document_header',
      leftRail: 'context_rail',
      mainPane: 'document_workspace',
      detailPane: 'knowledge_inspector',
    },
    rules: [
      'one_shell_multiple_modes',
      'summary_first',
      'contextual_actions_only',
      'avoid_dashboard_mosaic',
    ],
  },
  knowledgeInspector: {
    id: 'readflow_knowledge_inspector_v1',
    label: 'ReadFlow Knowledge Inspector',
    purpose: '用于展示当前判断、背景说明和连续问题流。',
    structure: [
      'fixed_summary_head',
      'selected_object_snapshot',
      'scrolling_issue_flow',
    ],
    rules: [
      'reason_before_action',
      'quiet_badges',
      'sticky_summary',
    ],
  },
  chapterMaintenancePane: {
    id: 'readflow_chapter_maintenance_v1',
    label: 'ReadFlow Chapter Maintenance Pane',
    purpose: '用于规则、Prompt、回退等治理章节的摘要优先维护界面。',
    structure: [
      'chapter_nav',
      'overview_section',
      'single_active_edit_lane',
      'summary_then_expand',
    ],
    rules: [
      'one_active_editor',
      'chapter_based_grouping',
      'reduce_form_noise',
    ],
  },
};

module.exports = {
  READFLOW_UI_TEMPLATES,
};
