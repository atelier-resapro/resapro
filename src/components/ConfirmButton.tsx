import { useState, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

interface ConfirmButtonProps {
  children: ReactNode;
  /** Question shown before the action is done. */
  question: string;
  onConfirm: () => void;
  disabled?: boolean;
  variant?: ButtonProps["variant"];
}

/** A button that asks "are you sure?" first (no browser dialog, works with keyboard and phone). */
const ConfirmButton = ({ children, question, onConfirm, disabled, variant = "outline" }: ConfirmButtonProps) => {
  const [demande, setDemande] = useState(false);

  if (!demande) {
    return (
      <Button type="button" size="sm" variant={variant} disabled={disabled} onClick={() => setDemande(true)}>
        {children}
      </Button>
    );
  }

  return (
    <div role="alertdialog" aria-label={question} className="flex flex-wrap items-center gap-2">
      <span className="text-sm">{question}</span>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={disabled}
        onClick={() => {
          setDemande(false);
          onConfirm();
        }}
      >
        Oui
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setDemande(false)}>
        Non
      </Button>
    </div>
  );
};

export default ConfirmButton;
