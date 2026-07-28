window.ManagerData = {
  store: {
    name: "朝阳大悦城店",
    level: "金牌",
    managerInitial: "林"
  },
  todayPerformance: {
    label: "今日业绩",
    target: 35000,
    actual: 21800,
    progress: 62,
    note: "下午3位预约客户到店后可达标",
    monthActual: 486000,
    monthTarget: 680000,
    monthProgress: 71,
    estimatedIncome: 47200
  },
  priorities: [
    {
      id: "vip-risk",
      strip: "danger",
      badges: [
        { text: "紧急", type: "danger" },
        { text: "客户风险", type: "neutral" }
      ],
      title: "VIP客户张女士反馈术后不适",
      description: "昨日热玛吉术后反馈红肿超预期，已超24h未处理",
      buttonText: "立即处理",
      detailTitle: "VIP客户张女士风险处理",
      detail: [
        "客户昨日18:20反馈红肿和灼热感强于预期，目前顾问尚未完成复访闭环。",
        "建议店长亲自致电安抚，并安排主任美容师进行免费修复面诊。",
        "若客户情绪继续升级，需在2小时内同步区域运营经理。"
      ]
    },
    {
      id: "sleeping-customers",
      strip: "primary",
      badges: [{ text: "增长机会", type: "info" }],
      title: "18位沉睡客户可唤醒",
      description: "60天以上未到店高价值客户，预估贡献 ¥52,000",
      buttonText: "查看详情",
      detailTitle: "沉睡客户唤醒建议",
      detail: [
        "18位客户历史月均消费超过 ¥3,000，最近60天未到店。",
        "建议由对应顾问发起关怀触达，店长抽查高价值客户话术质量。",
        "推荐权益：皮肤检测复诊、老客专属护理券、医美入门项目体验价。"
      ]
    },
    {
      id: "consultant-warning",
      strip: "warning",
      badges: [{ text: "团队关注", type: "warning" }],
      title: "顾问张悦连续3日转化异常",
      description: "成交率从45%降至18%，AI识别为需求挖掘环节薄弱",
      buttonText: "查看建议",
      detailTitle: "张悦转化异常辅导建议",
      detail: [
        "近3日录音中，客户预算和项目顾虑未被充分追问。",
        "建议今日晚间安排15分钟复盘，重点练习需求确认和方案递进。",
        "可让王丽分享本周高客单成交案例，形成可复用话术。"
      ]
    }
  ],
  boards: [
    {
      id: "customer",
      href: "customer.html",
      title: "客户经营",
      percent: 68,
      color: "#10B981",
      badge: "健康",
      badgeType: "success"
    },
    {
      id: "team",
      href: "team.html",
      title: "团队管理",
      percent: 75,
      color: "#F59E0B",
      badge: "关注",
      badgeType: "warning"
    },
    {
      id: "operations",
      href: "operations.html",
      title: "运营保障",
      percent: 92,
      color: "#10B981",
      badge: "正常",
      badgeType: "success"
    }
  ]
};
