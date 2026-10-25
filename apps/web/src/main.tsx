import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AppearanceProvider } from './components/AppearanceProvider';
import { PageActionBridge } from './components/PageActionBridge';
import 'twenty-ui/style.css';
import 'twenty-ui/theme-light.css';
import 'twenty-ui/theme-dark.css';
import './styles.css';
import './responsive.css';
import './product-experience.css';
// Keep the governed CRM visual system after feature-local legacy CSS so active
// appearance tokens remain authoritative, then apply the page-chrome extension.
import './crm-visual-system.css';
import './components/page-header-consolidation.css';
// Batch 13 owns viewport-modal geometry and must stay after feature-local drawer CSS.
import './components/customer-modal-fix.css';
// Batch 14 closes remaining dark-theme fallback gaps across business surfaces.
import './batch14-dark-theme.css';
// Batch 15 keeps custom menus/drawers outside generic clipping/transform contexts.
import './components/floating-layer-hardening.css';
// Batch 16 unifies business record modals, leading row actions and identity modal geometry.
import './batch16-business-ux.css';
// Batch 17 keeps the TOP500 75-field detail/editor on the active appearance tokens.
import './batch17-top500-profile-hardening.css';
import './enterprise-experience.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppearanceProvider>
      <App />
      <PageActionBridge />
    </AppearanceProvider>
  </React.StrictMode>,
);
