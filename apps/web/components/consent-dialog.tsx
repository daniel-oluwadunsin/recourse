'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export function ConsentDialog({
  open,
  onOpenChange,
  onAccept,
  busy,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onAccept(): Promise<void>;
  busy: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#2d2d2d]/55 backdrop-blur-[2px]" />
        <Dialog.Content className="paper-panel fixed left-1/2 top-1/2 z-50 w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 p-6 sm:p-8">
          <Dialog.Close
            className="paper-button quiet absolute right-3 top-3 !min-h-10 !p-2"
            aria-label="Close"
          >
            <X />
          </Dialog.Close>
          <p className="eyebrow">Before the first review</p>
          <Dialog.Title className="font-display mt-2 text-3xl font-bold">
            A clear privacy note
          </Dialog.Title>
          <Dialog.Description className="mt-4 space-y-3 text-[1.05rem]">
            <span className="block">
              Recourse uses Google&apos;s unpaid Gemini service to understand
              your case and uploaded evidence.
            </span>
            <span className="block">
              Google states that content submitted through unpaid usage may be
              used to improve its products and may be reviewed by people. Avoid
              uploading anything you are not comfortable processing this way.
            </span>
            <span className="block">
              We store your case so you can continue it. We do not intentionally
              log raw evidence, and Recourse never submits anything externally
              for you.
            </span>
          </Dialog.Description>
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Dialog.Close className="paper-button">Not now</Dialog.Close>
            <button
              className="paper-button primary"
              disabled={busy}
              onClick={() => void onAccept()}
            >
              {busy ? 'Saving…' : 'I understand — continue'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
