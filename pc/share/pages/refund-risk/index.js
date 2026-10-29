/* Register synchronously. The loader awaits initialization without top-level writes. */
window.PCModules['refund-risk']={
  ready:Promise.resolve().then(()=>RefundRiskApp.initialize()),
  render:()=>RefundRiskApp.enter(),
  leave:()=>RefundRiskApp.leave()
};
