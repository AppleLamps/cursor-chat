import ChatApp from "@/components/ChatApp";
import { getGitHubOAuthConfig } from "@/lib/github-oauth";

// Read the env at request time so enabling GitHub sign-in needs no rebuild.
export const dynamic = "force-dynamic";

export default function Page() {
  return <ChatApp githubOAuthEnabled={getGitHubOAuthConfig() !== null} />;
}
