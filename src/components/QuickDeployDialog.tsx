/**
 * QuickDeployDialog - A 3-step "Deploy from Image" wizard built on Radix Dialog.
 *
 * Required CSS classes:
 *   .compass-deploy-overlay    - backdrop overlay (position: fixed, inset: 0, backdrop-filter: blur(8px), background: rgba(0,0,0,0.5))
 *   .compass-deploy-content    - dialog panel (glass style: background with transparency, border, border-radius, box-shadow)
 *   .compass-deploy-title      - dialog title (font-size, font-weight, color)
 *   .compass-deploy-desc       - subtitle / description line
 *   .compass-deploy-steps      - step indicator container (display: flex, gap, justify-content: center)
 *   .compass-deploy-dot        - step dot (width, height, border-radius: 50%, background, transition)
 *   .compass-deploy-dot--active - active step dot (background highlight)
 *   .compass-deploy-field      - field wrapper (display: flex, flex-direction: column, gap)
 *   .compass-deploy-label      - label element (font-size, font-weight, color)
 *   .compass-deploy-input      - text / number input (background, border, border-radius, padding, color, outline styles)
 *   .compass-deploy-textarea   - textarea input (same base as input, resize: vertical)
 *   .compass-deploy-counter    - replica counter row (display: flex, align-items: center, gap)
 *   .compass-deploy-counter-btn - +/- button for counter (width, height, border-radius: 50%, background, border, color)
 *   .compass-deploy-counter-val - counter value display (font-size, font-weight, min-width, text-align: center)
 *   .compass-deploy-summary    - summary card (background, border, border-radius, padding)
 *   .compass-deploy-summary-row - summary row (display: flex, justify-content: space-between, padding, border-bottom)
 *   .compass-deploy-summary-label - summary label (color, font-size)
 *   .compass-deploy-summary-value - summary value (color, font-weight)
 *   .compass-deploy-actions    - button row (display: flex, gap, justify-content: flex-end)
 *   .compass-deploy-btn        - base button style
 *   .compass-deploy-btn--back  - back / secondary button
 *   .compass-deploy-btn--next  - next / primary button
 *   .compass-deploy-btn--deploy - deploy / submit button (accent color)
 *   .compass-deploy-close      - close icon button (position: absolute, top-right)
 *
 * Animation keyframes:
 *   @keyframes compass-deploy-slide-in {
 *     from { opacity: 0; transform: translate(-50%, -48%); }
 *     to   { opacity: 1; transform: translate(-50%, -50%); }
 *   }
 */

import React, { useState, useCallback, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useUIStore } from '@/store/useUIStore';

interface QuickDeployDialogProps {
  open: boolean;
  onClose: () => void;
}

interface DeployFormState {
  appName: string;
  image: string;
  namespace: string;
  replicas: number;
  port: number;
  envVars: string;
}

const INITIAL_FORM: DeployFormState = {
  appName: '',
  image: '',
  namespace: 'default',
  replicas: 1,
  port: 8080,
  envVars: '',
};

const STEP_LABELS = ['Image & Name', 'Configuration', 'Review & Deploy'] as const;

const QuickDeployDialog: React.FC<QuickDeployDialogProps> = ({ open, onClose }) => {
  const addToast = useUIStore((s) => s.addToast);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<DeployFormState>(INITIAL_FORM);

  useEffect(() => {
    if (open) {
      setStep(0);
      setForm(INITIAL_FORM);
    }
  }, [open]);

  const updateField = useCallback(<K extends keyof DeployFormState>(key: K, value: DeployFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleNext = useCallback(() => {
    setStep((s) => Math.min(s + 1, 2));
  }, []);

  const handleBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const handleDeploy = useCallback(async () => {
    const ns = form.namespace || 'default';
    const envParsed = form.envVars.trim()
      ? form.envVars.trim().split('\n').map((line) => {
          const idx = line.indexOf('=');
          return idx > 0 ? { name: line.slice(0, idx), value: line.slice(idx + 1) } : null;
        }).filter(Boolean)
      : undefined;
    try {
      const res = await fetch(`/api/kubernetes/apis/apps/v1/namespaces/${encodeURIComponent(ns)}/deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiVersion: 'apps/v1', kind: 'Deployment',
          metadata: { name: form.appName, namespace: ns, labels: { app: form.appName } },
          spec: {
            replicas: form.replicas,
            selector: { matchLabels: { app: form.appName } },
            template: {
              metadata: { labels: { app: form.appName } },
              spec: { containers: [{
                name: form.appName, image: form.image,
                ports: [{ containerPort: form.port }],
                ...(envParsed?.length ? { env: envParsed } : {}),
              }] },
            },
          },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      addToast({ type: 'success', title: `Deployed ${form.appName}`, description: `Created in ${ns}` });
      onClose();
    } catch (err) {
      addToast({ type: 'error', title: 'Deploy failed', description: err instanceof Error ? err.message : String(err) });
    }
  }, [form, addToast, onClose]);

  const canProceedStep0 = form.appName.trim() !== '' && form.image.trim() !== '';

  const renderStepIndicator = () => (
    <div
      className="compass-deploy-steps os-deploy__steps"
    >
      {STEP_LABELS.map((label, i) => (
        <div
          key={label}
          className={`compass-deploy-dot os-deploy__dot${i <= step ? ' compass-deploy-dot--active os-deploy__dot--active' : ''}`}
          title={label}
        />
      ))}
    </div>
  );

  const renderStep0 = () => (
    <div className="os-deploy__step-fields">
      <div className="compass-deploy-field os-deploy__field">
        <label className="compass-deploy-label os-deploy__label" htmlFor="compass-deploy-app-name">
          Application Name <span className="os-deploy__required">*</span>
        </label>
        <input
          className="compass-deploy-input os-deploy__input"
          id="compass-deploy-app-name"
          type="text"
          placeholder="my-app"
          value={form.appName}
          onChange={(e) => updateField('appName', e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="compass-deploy-field os-deploy__field">
        <label className="compass-deploy-label os-deploy__label" htmlFor="compass-deploy-image">
          Container Image <span className="os-deploy__required">*</span>
        </label>
        <input
          className="compass-deploy-input os-deploy__input"
          id="compass-deploy-image"
          type="text"
          placeholder="nginx:latest"
          value={form.image}
          onChange={(e) => updateField('image', e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="compass-deploy-field os-deploy__field">
        <label className="compass-deploy-label os-deploy__label" htmlFor="compass-deploy-namespace">
          Namespace
        </label>
        <input
          className="compass-deploy-input os-deploy__input"
          id="compass-deploy-namespace"
          type="text"
          placeholder="default"
          value={form.namespace}
          onChange={(e) => updateField('namespace', e.target.value)}
          autoComplete="off"
        />
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div className="os-deploy__step-fields">
      <div className="compass-deploy-field os-deploy__field">
        <label className="compass-deploy-label os-deploy__label">
          Replicas
        </label>
        <div className="compass-deploy-counter os-deploy__counter">
          <button
            type="button"
            className={`compass-deploy-counter-btn os-deploy__counter-btn${form.replicas <= 0 ? ' os-deploy__counter-btn--disabled' : ''}`}
            disabled={form.replicas <= 0}
            onClick={() => updateField('replicas', Math.max(0, form.replicas - 1))}
            aria-label="Decrease replicas"
          >
            &#x2212;
          </button>
          <span
            className="compass-deploy-counter-val os-deploy__counter-val"
          >
            {form.replicas}
          </span>
          <button
            type="button"
            className="compass-deploy-counter-btn os-deploy__counter-btn"
            onClick={() => updateField('replicas', form.replicas + 1)}
            aria-label="Increase replicas"
          >
            &#x2b;
          </button>
        </div>
      </div>

      <div className="compass-deploy-field os-deploy__field">
        <label className="compass-deploy-label os-deploy__label" htmlFor="compass-deploy-port">
          Port
        </label>
        <input
          className="compass-deploy-input os-deploy__input os-deploy__input--port"
          id="compass-deploy-port"
          type="number"
          min={1}
          max={65535}
          value={form.port}
          onChange={(e) => updateField('port', Number(e.target.value))}
        />
      </div>

      <div className="compass-deploy-field os-deploy__field">
        <label className="compass-deploy-label os-deploy__label" htmlFor="compass-deploy-env">
          Environment Variables
        </label>
        <textarea
          className="compass-deploy-textarea os-deploy__textarea"
          id="compass-deploy-env"
          placeholder={"KEY=value\nANOTHER_KEY=another_value"}
          value={form.envVars}
          onChange={(e) => updateField('envVars', e.target.value)}
          rows={4}
        />
      </div>
    </div>
  );

  const summaryRows: Array<{ label: string; value: string }> = [
    { label: 'Application Name', value: form.appName },
    { label: 'Image', value: form.image },
    { label: 'Namespace', value: form.namespace || 'default' },
    { label: 'Replicas', value: String(form.replicas) },
    { label: 'Port', value: String(form.port) },
    { label: 'Environment Variables', value: form.envVars.trim() || 'None' },
  ];

  const renderStep2 = () => (
    <div
      className="compass-deploy-summary os-deploy__summary"
    >
      {summaryRows.map((row) => (
        <div
          key={row.label}
          className="compass-deploy-summary-row os-deploy__summary-row"
        >
          <span className="compass-deploy-summary-label os-deploy__summary-label">
            {row.label}
          </span>
          <span
            className="compass-deploy-summary-value os-deploy__summary-value"
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="compass-deploy-overlay os-deploy__overlay"
        />
        <Dialog.Content
          className="compass-deploy-content os-deploy__content"
        >
          <Dialog.Title
            className="compass-deploy-title os-deploy__title"
          >
            Deploy from Image
          </Dialog.Title>

          <Dialog.Description
            className="compass-deploy-desc os-deploy__desc"
          >
            Step {step + 1} of 3: {STEP_LABELS[step]}
          </Dialog.Description>

          {renderStepIndicator()}

          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}

          <div
            className="compass-deploy-actions os-deploy__actions"
          >
            {step > 0 && (
              <button
                type="button"
                className="compass-deploy-btn compass-deploy-btn--back os-deploy__btn--back"
                onClick={handleBack}
              >
                Back
              </button>
            )}

            {step < 2 && (
              <button
                type="button"
                className="compass-deploy-btn compass-deploy-btn--next os-deploy__btn--next"
                disabled={step === 0 && !canProceedStep0}
                onClick={handleNext}
              >
                Next
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                className="compass-deploy-btn compass-deploy-btn--deploy os-deploy__btn--deploy"
                onClick={handleDeploy}
              >
                Deploy
              </button>
            )}
          </div>

          <Dialog.Close asChild>
            <button
              type="button"
              className="compass-deploy-close os-deploy__close"
              aria-label="Close"
              onClick={onClose}
            >
              &#x2715;
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default QuickDeployDialog;
