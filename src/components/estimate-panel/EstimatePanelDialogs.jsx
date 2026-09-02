import React, { memo } from 'react';

export const CloseEstimateDialog = memo(function CloseEstimateDialog({
  open,
  isSaving,
  onDiscard,
  onSave,
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <h2 className="text-base font-bold text-foreground mb-2">Un-Saved Estimate!</h2>
        <p className="text-sm text-muted-foreground mb-6">Do you wish to save the document?</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onDiscard} className="px-4 py-2 text-sm rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            No
          </button>
          <button onClick={onSave} disabled={isSaving} className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
            {isSaving ? 'Saving…' : 'Yes'}
          </button>
        </div>
      </div>
    </div>
  );
});

export const SaveTemplateDialog = memo(function SaveTemplateDialog({
  open,
  templateName,
  templateDescription,
  isSaving,
  onNameChange,
  onDescriptionChange,
  onCancel,
  onSave,
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <h2 className="text-base font-bold text-foreground mb-1">Save as Estimate Template</h2>
        <p className="text-xs text-muted-foreground mb-4">
          This snapshot will be saved to the Templates page and can be reopened in the Estimate Panel anytime.
          <span className="block mt-1 text-destructive font-medium">Note: "Est_Template" is a reserved name and cannot be used.</span>
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Template Name *</label>
            <input
              autoFocus
              className="w-full text-sm bg-secondary border border-border rounded px-3 py-1.5 text-foreground outline-none focus:border-primary transition-colors"
              placeholder="e.g. KEYERA FT SASK Standard"
              value={templateName}
              onChange={event => onNameChange(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && onSave()}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Description (optional)</label>
            <textarea
              className="w-full text-sm bg-secondary border border-border rounded px-3 py-1.5 text-foreground outline-none focus:border-primary transition-colors resize-none h-16"
              placeholder="What is this template for?"
              value={templateDescription}
              onChange={event => onDescriptionChange(event.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            Cancel
          </button>
          <button onClick={onSave} disabled={!templateName.trim() || isSaving} className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium disabled:opacity-50">
            {isSaving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
});
