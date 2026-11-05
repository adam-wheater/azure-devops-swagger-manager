import * as React from "react";
import { Banner, Button, Gate, IconUsers } from "./ui";

interface AdminClaimPageProps {
  currentUserName: string;
  onClaim: () => Promise<void>;
  error: string | null;
}

export const AdminClaimPage: React.FC<AdminClaimPageProps> = ({
  currentUserName,
  onClaim,
  error,
}) => {
  const [claiming, setClaiming] = React.useState(false);

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await onClaim();
    } finally {
      setClaiming(false);
    }
  };

  return (
    <Gate title="Swagger Manager setup" icon={<IconUsers size={26} />}>
      <p className="ax-gate__body">
        This extension has not been configured yet. The first person to claim admin will be able to
        manage API registrations, settings, and invite other admins.
      </p>
      <div className="ax-gate__identity">Signed in as {currentUserName}</div>
      {error && (
        <Banner tone="error" title="Could not claim admin">
          {error}
        </Banner>
      )}
      <Button variant="primary" onClick={handleClaim} busy={claiming}>
        {claiming ? "Claiming..." : "Claim Admin"}
      </Button>
    </Gate>
  );
};
