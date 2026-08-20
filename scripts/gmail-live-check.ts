import { parseEnvironment } from "../packages/config/src/index.js";
import { GmailEmailProvider } from "../apps/api/src/modules/email/gmail.provider";

async function main(): Promise<void> {
  const environment = parseEnvironment();
  if (environment.EMAIL_PROVIDER !== "gmail") {
    throw new Error("Set EMAIL_PROVIDER=gmail to run the Gmail live check.");
  }
  const config = {
    get: <K extends keyof typeof environment>(key: K) => environment[key],
    getOrThrow: <K extends keyof typeof environment>(key: K) => {
      const value = environment[key];
      if (value === undefined || value === null || value === "") {
        throw new Error(`${String(key)} is required.`);
      }
      return value;
    },
  } as ConstructorParameters<typeof GmailEmailProvider>[0];
  const provider = new GmailEmailProvider(config);
  const [smtp, imap] = await Promise.all([
    provider.verifyConnection(),
    provider.verifyImapConnection(),
  ]);
  if (smtp.status !== "ok" || imap.status !== "ok") {
    throw new Error(
      `Gmail verification failed: SMTP=${smtp.status}, IMAP=${imap.status}`,
    );
  }
  process.stdout.write(
    JSON.stringify({
      provider: "gmail",
      smtp: smtp.status,
      imap: imap.status,
      inboundMailbox: environment.GMAIL_IMAP_MAILBOX,
      sent: false,
    }) + "\n",
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
