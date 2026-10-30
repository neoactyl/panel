# Neoactyl

> Game server management, reimagined.

Neoactyl is an open-source game hosting management panel for managing servers, users, storefronts, credits, and rewards in one place.

It was started because I found Heliactyl slow and awkward to use. I wanted to build a panel with a better user experience and, especially, support for different server management backends.

Unlike panels that only work with Pterodactyl, Neoactyl uses an adapter system to communicate with different backends. Currently, the Calagopus and Mock adapters are available.

## Why?

I wanted a game hosting panel that didn't feel unnecessarily slow or awkward to navigate.

Neoactyl is my attempt at solving that problem while making the panel flexible enough to work with different server management systems. Instead of tying everything to one backend, Neoactyl uses adapters so that support for other systems can be added independently.

The project is still evolving, but the aim is to keep server management straightforward without limiting hosting providers to a single backend.

## Developer Notice

> [!WARNING]
> **Neoactyl is under active development.**
>
> Features and internal APIs may change, and some parts of the project may still be incomplete. Use it for testing and development rather than relying on it for production hosting.

## Features

### Server Management

- **Full Server Management** — Manage game servers from the Neoactyl dashboard.
- **Server Renewals** — Let users renew their servers using credits.
- **Software Selection** — Configure server software through available eggs and nests.
- **Resource Management** — Manage server resource allocations, including CPU, memory, and disk.

### Economy and Rewards

- **Credits System** — A virtual currency used for purchasing and renewing servers.
- **Stripe Integration** — Allow users to purchase credits through Stripe.
- **Storefront** — Offer server plans that users can purchase with credits.
- **AFK Page** — Let users earn credits through the AFK system.
- **Discord Invite Rewards** — Reward users for inviting people to a Discord server.
- **Join for Rewards (J4R)** — Reward users for joining designated Discord servers.

### Adapter System

Neoactyl uses adapters to communicate with server management backends. This keeps backend-specific code separate from the panel itself.

The goal is to support different types of server management systems without requiring a separate Neoactyl interface for each one.

#### Available Adapters

| Adapter       | Description                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------- |
| **Calagopus** | Connects Neoactyl to Calagopus.                                                              |
| **Mock**      | Provides a mock backend for development and testing without a live server management system. |

These are currently the only available adapters. Other backends will need their own adapter implementations before they can be used with Neoactyl.

### Administration

The admin panel includes the following sections:

| Section           | Purpose                                                   |
| ----------------- | --------------------------------------------------------- |
| **Servers**       | Manage servers across the panel.                          |
| **Storefront**    | Manage available server plans.                            |
| **Economy**       | Manage credits and economy-related features.              |
| **Users**         | Manage user accounts.                                     |
| **Softwares**     | Manage software configurations, including eggs and nests. |
| **Nodes**         | Manage hosting nodes.                                     |
| **System Health** | Check the status of the system.                           |
| **Logs**          | Review system and operational logs.                       |
| **Settings**      | Configure panel settings.                                 |

## Installation

### Requirements

- [Bun](https://bun.sh/)
- Git
- A supported database
- A compatible backend adapter, unless using Mock

### Development

Clone the repository:

```bash
git clone https://github.com/neoactyl/panel.git
cd panel
```

Install dependencies:

```bash
bun install
```

Create the environment file:

```bash
cp .env.example .env
```

Configure the required environment variables, including the database connection and authentication settings.

Start the development server:

```bash
bun run dev
```

### Production

Build the panel:

```bash
bun run --bun build
```

Start the application after the build completes:

```bash
bun --bun start
```

Make sure the environment is configured correctly before starting the production server.

## License

Neoactyl uses the **Creative Commons Attribution (CC BY)** license.

CC BY allows people to share and adapt licensed material, including for commercial purposes, provided they give appropriate credit, link to the license, and indicate whether changes were made.

See the [Creative Commons website](https://creativecommons.org/licenses/) for more information.

## Contributors and Sponsors

### Contributors

Contributions are welcome. You can help by reporting bugs, suggesting features, improving documentation, or submitting code changes.

Visit the [Neoactyl GitHub organization](https://github.com/neoactyl) to find the project repositories.

### Sponsors

Sponsors help support the project's development and infrastructure. Sponsor information and acknowledgements will be added here as the project grows.

---

**Neoactyl** — Game server management, reimagined.
