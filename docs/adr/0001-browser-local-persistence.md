# Browser-local persistence only

This app is a single-operator scan workstation with no multi-user sync requirement. We persist 登记记录 in the browser `localStorage` and ship no backend, so the first version stays a pure Quasar SPA. Operators back up by exporting Excel; clearing site data or switching machines loses local rows.
