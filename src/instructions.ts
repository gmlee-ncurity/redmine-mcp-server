/**
 * Server instructions sent to the client at initialization.
 *
 * Clients such as Claude Code keep these in the model's context for as long as
 * the server is connected, which makes them the one place where the Redmine
 * address the server was started with (REDMINE_URL) reaches the model. Tool
 * results carry issue ids but no web address, so without this the model guesses
 * a host when it writes an issue link.
 */

/**
 * REDMINE_URL reduced to a web base: credentials, query and fragment removed,
 * no trailing slash. A sub-path deployment (https://host/redmine) is kept.
 */
export function redmineWebBase(redmineUrl: string): string {
  const url = new URL(redmineUrl);
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

export function buildInstructions(redmineUrl: string): string {
  const base = redmineWebBase(redmineUrl);
  return [
    `Redmine web address for this server: ${base}`,
    `- Link to an issue as ${base}/issues/<id> (for example ${base}/issues/123). A wiki page is ${base}/projects/<project identifier>/wiki/<page title>.`,
    '- Take the host only from this address. It comes from the REDMINE_URL the server was started with. Do not reuse a Redmine host from memory, earlier conversations or other documents.',
  ].join('\n');
}
