export function bindGeoControls({
  state,
  render,
  toggleGeoSourceEnabled,
  removeGeoSource,
  deleteGeoFile,
}) {
  document.querySelectorAll('[data-geo-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      state.geoPreset = button.dataset.geoPreset;
      render();
    });
  });
  document.querySelectorAll('[data-geo-base]').forEach((button) => {
    button.addEventListener('click', () => {
      state.geoBasePreset = button.dataset.geoBase;
      state.geoPreset = button.dataset.geoBase;
      render();
    });
  });
  document.querySelectorAll('[data-geo-extra]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.dataset.geoExtra;
      state.geoExtraPresets = input.checked
        ? [...new Set([...state.geoExtraPresets, id])]
        : state.geoExtraPresets.filter((item) => item !== id);
      render();
    });
  });
  document.querySelectorAll('[data-geo-custom]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.dataset.geoCustom;
      state.geoCustomSourceIds = input.checked
        ? [...new Set([...state.geoCustomSourceIds, id])]
        : state.geoCustomSourceIds.filter((item) => item !== id);
      render();
    });
  });
  document.querySelectorAll('[data-geo-source-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const source = state.geoCustomSources.find((item) => item.id === button.dataset.geoSourceToggle);
      if (source) toggleGeoSourceEnabled(source.id, source.enabled === false);
    });
  });
  document.querySelectorAll('[data-geo-source-delete]').forEach((button) => {
    button.addEventListener('click', () => removeGeoSource(button.dataset.geoSourceDelete));
  });
  document.querySelectorAll('[data-geo-delete]').forEach((button) => {
    button.addEventListener('click', () => deleteGeoFile(button.dataset.geoDelete));
  });

  document.querySelector('#geoipUrl')?.addEventListener('input', (event) => {
    state.geoipUrl = event.target.value;
  });
  document.querySelector('#geositeUrl')?.addEventListener('input', (event) => {
    state.geositeUrl = event.target.value;
  });
  document.querySelector('#geoSourceName')?.addEventListener('input', (event) => {
    state.geoSourceName = event.target.value;
  });
  document.querySelector('#geoSourceKind')?.addEventListener('change', (event) => {
    state.geoSourceKind = event.target.value;
    render();
  });
  document.querySelector('#geoSourceGeoipUrl')?.addEventListener('input', (event) => {
    state.geoSourceGeoipUrl = event.target.value;
  });
  document.querySelector('#geoSourceGeositeUrl')?.addEventListener('input', (event) => {
    state.geoSourceGeositeUrl = event.target.value;
  });
  document.querySelector('#geoSourceUrl')?.addEventListener('input', (event) => {
    state.geoSourceUrl = event.target.value;
  });
  document.querySelector('#geoSourceTarget')?.addEventListener('input', (event) => {
    state.geoSourceTarget = event.target.value;
  });
  document.querySelector('#geoBackup')?.addEventListener('change', (event) => {
    state.geoBackup = event.target.checked;
    render();
  });
  document.querySelector('#geoScheduleEnabled')?.addEventListener('change', (event) => {
    state.geoScheduleEnabled = event.target.checked;
  });
  document.querySelector('#geoScheduleInterval')?.addEventListener('change', (event) => {
    state.geoScheduleInterval = event.target.value;
    render();
  });
  document.querySelector('#geoScheduleWeekday')?.addEventListener('change', (event) => {
    state.geoScheduleWeekday = event.target.value;
  });
  document.querySelector('#geoScheduleTime')?.addEventListener('input', (event) => {
    state.geoScheduleTime = event.target.value;
  });
}
