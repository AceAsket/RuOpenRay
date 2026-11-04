export function createSetupNavigation({ state, render, stepIds, stepGate }) {
  const steps = [...stepIds];
  const currentIndex = () => Math.max(0, steps.indexOf(state.setupStep));

  function selectSetupStep(target) {
    if (state.setupApplying || state.setupRollbacking) return false;
    const targetIndex = steps.indexOf(target);
    if (targetIndex < 0) return false;
    let notice = null;
    if (targetIndex > currentIndex()) {
      for (const step of steps.slice(0, targetIndex)) {
        const gate = stepGate(step);
        if (!gate.ok) {
          state.setupStepNotice = gate.notice ? { ...gate.notice, step: state.setupStep || steps[0] } : null;
          render();
          return false;
        }
        notice = gate.notice;
      }
    }
    state.setupStep = target;
    state.setupStepNotice = notice ? { ...notice, step: target } : null;
    render();
    return true;
  }

  return {
    selectSetupStep,
    setupStepBack: () => selectSetupStep(steps[Math.max(0, currentIndex() - 1)]),
    setupStepNext: () => selectSetupStep(steps[Math.min(steps.length - 1, currentIndex() + 1)])
  };
}
