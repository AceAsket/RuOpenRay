export function bindRoutingControls({
  state,
  render,
  firewallPortsStorageKey,
  firewallDnsInterceptStorageKey,
  addRoutingPreset,
  editRoutingPreset,
  deleteCustomRoutePreset,
  removeRoutingRule,
  disableRoutingRule,
  restoreDisabledRouteRule,
  deleteDisabledRouteRule,
  moveRoutingRule,
  openRoutingRuleEditor,
  openRouteBalancerDialog,
  removeRouteBalancer,
  setFirewallBypassMode,
  setFirewallRouterMode,
  setFirewallDeviceMode,
  toggleFirewallDevice,
  setFirewallKillSwitchDeviceMode,
  toggleFirewallKillSwitchDevice,
  reorderRoutingRule,
  routeRules,
  describeRouteRule,
  updateRoutingTarget,
  removeOutbound,
  routeAllToOutbound,
  checkServers,
  setSnifferDraft,
  setQuicPolicy,
  currentSnifferSettings,
  setFirewallPortMode,
  setFirewallBlockQuic,
  setFirewallKillSwitchEnabled,
  setFirewallKillSwitchDomainMode,
  setFirewallKillSwitchTargets,
  applyLeaseSearch,
  setRouteBalancerSelector,
  moveRouteBalancerSelector,
  balancerOptions,
}) {
  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => addRoutingPreset(button.dataset.preset));
  });
  document.querySelectorAll('[data-route-preset-check]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const key = checkbox.dataset.routePresetCheck;
      const selected = new Set(state.selectedRoutePresets);
      if (checkbox.checked) selected.add(key);
      else selected.delete(key);
      state.selectedRoutePresets = [...selected];
      checkbox.closest('.preset-check')?.classList.toggle('active', checkbox.checked);
      const applyButton = document.querySelector('[data-action="applyRoutePresets"]');
      if (applyButton) applyButton.disabled = state.selectedRoutePresets.length === 0;
    });
  });
  document.querySelectorAll('[data-route-preset-edit]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      editRoutingPreset(button.dataset.routePresetEdit);
    });
  });
  document.querySelectorAll('[data-route-preset-delete]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteCustomRoutePreset(button.dataset.routePresetDelete);
    });
  });
  document.querySelectorAll('[data-route-delete]').forEach((button) => {
    button.addEventListener('click', () => removeRoutingRule(Number(button.dataset.routeDelete)));
  });
  document.querySelectorAll('[data-route-disable]').forEach((button) => {
    button.addEventListener('click', () => disableRoutingRule(Number(button.dataset.routeDisable)));
  });
  document.querySelectorAll('[data-route-restore]').forEach((button) => {
    button.addEventListener('click', () => restoreDisabledRouteRule(button.dataset.routeRestore));
  });
  document.querySelectorAll('[data-route-disabled-delete]').forEach((button) => {
    button.addEventListener('click', () => deleteDisabledRouteRule(button.dataset.routeDisabledDelete));
  });
  document.querySelectorAll('[data-route-move]').forEach((button) => {
    button.addEventListener('click', () => moveRoutingRule(Number(button.dataset.routeMove), Number(button.dataset.direction)));
  });
  document.querySelectorAll('[data-route-edit]').forEach((button) => {
    button.addEventListener('click', () => openRoutingRuleEditor(Number(button.dataset.routeEdit)));
  });
  document.querySelectorAll('[data-route-balancer-edit]').forEach((button) => {
    button.addEventListener('click', () => openRouteBalancerDialog(Number(button.dataset.routeBalancerEdit)));
  });
  document.querySelectorAll('[data-route-balancer-delete]').forEach((button) => {
    button.addEventListener('click', () => removeRouteBalancer(Number(button.dataset.routeBalancerDelete)));
  });
  document.querySelectorAll('[data-firewall-bypass-mode]').forEach((button) => {
    button.addEventListener('click', () => setFirewallBypassMode(button.dataset.firewallBypassMode));
  });
  document.querySelectorAll('[data-firewall-router-mode]').forEach((button) => {
    button.addEventListener('click', () => setFirewallRouterMode(button.dataset.firewallRouterMode));
  });
  document.querySelectorAll('[data-firewall-device-mode]').forEach((button) => {
    button.addEventListener('click', () => setFirewallDeviceMode(button.dataset.firewallDeviceMode));
  });
  document.querySelectorAll('[data-firewall-device]').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => toggleFirewallDevice(checkbox.dataset.firewallDevice, event.target.checked));
  });
  document.querySelectorAll('[data-kill-switch-device-mode]').forEach((button) => {
    button.addEventListener('click', () => setFirewallKillSwitchDeviceMode(button.dataset.killSwitchDeviceMode));
  });
  document.querySelectorAll('[data-kill-switch-device]').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => toggleFirewallKillSwitchDevice(checkbox.dataset.killSwitchDevice, event.target.checked));
  });
  document.querySelectorAll('[data-route-index]').forEach((row) => {
    row.addEventListener('pointerdown', (event) => {
      row.dataset.dragHandle = event.target.closest('.route-drag-handle') ? '1' : '0';
    });
    row.addEventListener('dragstart', (event) => {
      if (row.dataset.dragHandle !== '1') {
        event.preventDefault();
        return;
      }
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', row.dataset.routeIndex);
    });
    row.addEventListener('dragend', () => {
      document.querySelectorAll('.route-row.dragging, .route-row.drag-over, .route-row.drop-before, .route-row.drop-after')
        .forEach((item) => item.classList.remove('dragging', 'drag-over', 'drop-before', 'drop-after'));
    });
    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      document.querySelectorAll('.route-row.drag-over, .route-row.drop-before, .route-row.drop-after')
        .forEach((item) => {
          if (item !== row) item.classList.remove('drag-over', 'drop-before', 'drop-after');
        });
      row.classList.add('drag-over');
      row.classList.toggle('drop-before', before);
      row.classList.toggle('drop-after', !before);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over', 'drop-before', 'drop-after'));
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      const fromIndex = Number(event.dataTransfer.getData('text/plain'));
      const toIndex = Number(row.dataset.routeIndex);
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      row.classList.remove('drag-over', 'drop-before', 'drop-after');
      reorderRoutingRule(fromIndex, before ? toIndex : toIndex + 1);
    });
  });
  document.querySelectorAll('[data-route-focus]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.routeFocus);
      const rule = routeRules()[index];
      const info = rule ? describeRouteRule(rule) : null;
      state.routeSearch = info?.value || '';
      state.tab = 'routing';
      render();
    });
  });
  document.querySelectorAll('[data-route-target]').forEach((select) => {
    select.addEventListener('change', (event) => updateRoutingTarget(Number(select.dataset.routeTarget), event.target.value));
  });
  document.querySelectorAll('[data-outbound-delete]').forEach((button) => {
    button.addEventListener('click', () => removeOutbound(Number(button.dataset.outboundDelete)));
  });
  document.querySelectorAll('[data-route-all]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await routeAllToOutbound(button.dataset.routeAll);
      } catch (error) {
        state.configApplying = false;
        state.message = error.message;
        render();
      }
    });
  });
  document.querySelectorAll('[data-dashboard-connect]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await routeAllToOutbound(button.dataset.dashboardConnect);
      } catch (error) {
        state.configApplying = false;
        state.message = error.message;
        render();
      }
    });
  });
  document.querySelectorAll('[data-server-check]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (state.serverChecking) return;
      try {
        await checkServers([button.dataset.serverCheck]);
      } catch (error) {
        state.serverChecking = false;
        state.serverCheckingTags = [];
        state.message = error.message;
        render();
      }
    });
  });

  document.querySelectorAll('[data-sniffer-mode]').forEach((button) => {
    button.addEventListener('click', () => setSnifferDraft(button.dataset.snifferMode));
  });
  document.querySelectorAll('[data-quic-policy]').forEach((button) => {
    button.addEventListener('click', () => setQuicPolicy(button.dataset.quicPolicy));
  });
  document.querySelector('#snifferRouteOnly')?.addEventListener('change', (event) => {
    setSnifferDraft(currentSnifferSettings().mode, { routeOnly: event.target.checked });
  });
  document.querySelector('#snifferExcluded')?.addEventListener('change', (event) => {
    setSnifferDraft(currentSnifferSettings().mode, { excluded: event.target.value });
  });
  document.querySelector('#firewallPorts')?.addEventListener('input', (event) => {
    state.firewallSafetyAccepted = false;
    state.firewallPorts = event.target.value;
    localStorage.setItem(firewallPortsStorageKey, state.firewallPorts);
  });
  document.querySelectorAll('[data-firewall-port-mode]').forEach((button) => {
    button.addEventListener('click', () => setFirewallPortMode(button.dataset.firewallPortMode));
  });
  document.querySelector('#firewallBlockQuic')?.addEventListener('change', (event) => setFirewallBlockQuic(event.target.checked));
  document.querySelector('#firewallDnsIntercept')?.addEventListener('change', (event) => {
    state.firewallSafetyAccepted = false;
    state.firewallDnsIntercept = event.target.checked;
    localStorage.setItem(firewallDnsInterceptStorageKey, state.firewallDnsIntercept ? '1' : '0');
    render();
  });
  document.querySelector('#firewallSafetyAccepted')?.addEventListener('change', (event) => {
    state.firewallSafetyAccepted = event.target.checked;
    render();
  });
  document.querySelector('#firewallKillSwitchEnabled')?.addEventListener('change', (event) => setFirewallKillSwitchEnabled(event.target.checked));
  document.querySelectorAll('[data-kill-switch-domain-mode]').forEach((button) => {
    button.addEventListener('click', () => setFirewallKillSwitchDomainMode(button.dataset.killSwitchDomainMode));
  });
  document.querySelector('#firewallKillSwitchTargets')?.addEventListener('input', (event) => setFirewallKillSwitchTargets(event.target.value));

  document.querySelectorAll('#routeKind').forEach((input) => input.addEventListener('change', (event) => {
    state.routeKind = event.target.value;
    render();
  }));
  document.querySelectorAll('#routeName').forEach((input) => input.addEventListener('input', (event) => {
    state.routeName = event.target.value;
  }));
  document.querySelectorAll('#routeValue').forEach((input) => input.addEventListener('input', (event) => {
    state.routeValue = event.target.value;
  }));
  document.querySelectorAll('[data-route-lease-ip]').forEach((button) => {
    button.addEventListener('click', () => {
      state.routeValue = button.dataset.routeLeaseIp || '';
      if (!state.routeName.trim() && button.dataset.routeLeaseName) state.routeName = button.dataset.routeLeaseName;
      render();
    });
  });
  document.querySelectorAll('[data-lease-search]').forEach((input) => {
    applyLeaseSearch(input.closest('.route-lease-picker, .panel') || document, input.value);
    input.addEventListener('input', (event) => {
      state.leaseSearch = event.target.value;
      applyLeaseSearch(input.closest('.route-lease-picker, .panel') || document, event.target.value);
    });
  });
  document.querySelectorAll('#routeOutbound').forEach((input) => input.addEventListener('change', (event) => {
    state.routeOutbound = event.target.value;
  }));
  document.querySelectorAll('#routeBalancer').forEach((input) => input.addEventListener('change', (event) => {
    state.routeBalancer = event.target.value;
  }));
  document.querySelector('#routeBalancerTag')?.addEventListener('input', (event) => {
    state.routeBalancerTag = event.target.value;
  });
  document.querySelector('#routeBalancerStrategy')?.addEventListener('change', (event) => {
    state.routeBalancerStrategy = event.target.value;
    render();
  });
  document.querySelectorAll('[data-balancer-selector]').forEach((input) => {
    input.addEventListener('change', (event) => {
      setRouteBalancerSelector(input.dataset.balancerSelector, event.target.checked);
      render();
    });
  });
  document.querySelectorAll('[data-balancer-selector-move]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      moveRouteBalancerSelector(button.dataset.balancerSelectorMove, Number(button.dataset.direction) || 0);
      render();
    });
  });
  document.querySelector('#routeBalancerFallback')?.addEventListener('change', (event) => {
    state.routeBalancerFallback = event.target.value;
  });
  document.querySelectorAll('[data-route-target-type]').forEach((button) => {
    button.addEventListener('click', () => {
      state.routeTargetType = button.dataset.routeTargetType;
      if (state.routeTargetType === 'balancer' && !state.routeBalancer) state.routeBalancer = balancerOptions()[0] || '';
      render();
    });
  });
  document.querySelectorAll('[data-route-rule-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.routeRuleMode = button.dataset.routeRuleMode;
      state.message = '';
      render();
    });
  });
  document.querySelector('#routeSearch')?.addEventListener('input', (event) => {
    state.routeSearch = event.target.value;
  });
  document.querySelector('#routeSearch')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') render();
  });
  document.querySelectorAll('#routeDslName').forEach((input) => input.addEventListener('input', (event) => {
    state.routeDslName = event.target.value;
  }));
  document.querySelectorAll('#routeDsl').forEach((input) => input.addEventListener('input', (event) => {
    state.routeDsl = event.target.value;
    state.routeDslPreview = null;
  }));
  document.querySelector('#routePresetEditTitle')?.addEventListener('input', (event) => {
    state.routePresetEditTitle = event.target.value;
  });
  document.querySelector('#routePresetEditDetail')?.addEventListener('input', (event) => {
    state.routePresetEditDetail = event.target.value;
  });
  document.querySelector('#routePresetEditDsl')?.addEventListener('input', (event) => {
    state.routePresetEditDsl = event.target.value;
    state.routePresetEditPreview = null;
    state.routePresetEditChecked = false;
  });
}
