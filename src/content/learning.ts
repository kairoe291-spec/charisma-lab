/** Shared five-stage teaching structure. The numeric position is persisted as course progress. */
export const learningStages = [
  {
    label: '认识概念',
    catalogLabel: '认识概念',
    eyebrow: 'CONCEPT · 认识概念',
    heading: '这节课，你会学到',
  },
  {
    label: '案例解析',
    catalogLabel: '分析案例',
    eyebrow: 'CASE · 案例解析',
    heading: '在真实生活里，做法有什么不同？',
  },
  {
    label: '场景模拟',
    catalogLabel: '场景模拟',
    eyebrow: 'SIMULATION · 场景模拟',
    heading: '换一种做法，会发生什么？',
    introduction:
      '到情景剧场试试不同的回应。每个选项都有反馈与替代方式，没有一套适用于所有人的固定套路。',
    followUp: '练习后返回本课，继续现实训练与复盘。',
  },
  {
    label: '现实训练',
    catalogLabel: '现实训练',
    eyebrow: 'PRACTICE · 现实训练',
    heading: '把这一课带到生活里',
  },
  {
    label: '测试与复盘',
    catalogLabel: '测试复盘',
    eyebrow: 'REFLECTION · 理解检测',
    heading: '检验理解，也听听自己的感受',
  },
] as const;
