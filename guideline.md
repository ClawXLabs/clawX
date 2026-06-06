# AVAX Claw - Frontend Architecture & UI/UX Guidelines

## 1. Project Overview
This document serves as a frontend compass for future AI agents and developers working on the AVAX Claw prediction market platform. The application allows users to bet on short-term crypto price movements on the Avalanche Fuji testnet. 

The current stack is built on **Next.js (Pages Router)** using **Tailwind CSS** for styling, **Recharts** for data visualization, and **ethers/web3** for blockchain interactions.

---

## 2. Component Architecture & Directory Structure

The frontend is organized into standard Next.js folders. Here is the breakdown of the existing components and their roles:

### Pages (`/pages`)
The app currently utilizes a heavy multi-page routing structure:
*   `_app.js`: The root component wrapping all pages. Injects the `WalletContext` and the `AppShell` layout.
*   `index.js`: The root landing page.
*   `faucet.js`: A utility page for users to claim testnet TUSDC.
*   `leaderboard.js`: Displays top human traders and agents.
*   `profile.js`: User's personal dashboard and trade history.
*   `markets/index.js`: The central hub listing all available trading markets.
*   `markets/trade.js`: The main trading interface for a specific asset.
*   `agents/index.js`: List of available automated trading agents.
*   `agents/[id].js`: Detailed view of a specific agent.
*   `agents/dashboard.js`: Dashboard for users to manage their enrolled agents.
*   `agents/new.js`: Interface to create and deploy a new agent.

### Core Components (`/components`)
*   `AppShell.js`: The main layout wrapper. Contains the top navigation bar, logo, and wallet connection button.
*   `LandingPage.js`: The marketing and entry-point UI (hero section, stats, how-it-works).
*   `ConnectWallet.js`: Reusable button/logic block for Web3 wallet connection.
*   `MarketsHub.js`: The grid view displaying active prediction markets.
*   `MarketCard.js`: Individual card component representing a single market (used in `MarketsHub`).
*   `TradingChart.js`: The Recharts-based component showing price history and oracle updates.
*   `HumanMarketTerminal.js` & `HumanMarketTerminalV2.js`: The heavy-lifting trading interfaces where users actually place UP/DOWN predictions. *(Note: V2 appears to be an iteration; consider deprecating V1 to reduce tech debt).*

### Agent Components (`/components/agents`)
*   `AgentCard.js`: Preview card for an agent.
*   `AgentFeed.js`: Activity feed showing an agent's recent trades.
*   `MyAgentBar.js`: A quick-access bar for the user's active agents.

### Contexts & Hooks (`/contexts`, `/hooks`)
*   `WalletContext.js`: Global state for the user's Web3 wallet connection, account address, and balance.
*   `useAgentEnrollment.js`: Custom hook managing the logic for enrolling in automated agents.

---

## 3. Page-to-Component Mapping (Dependencies & Composition)

To help developers and AI agents understand how the UI is assembled, this section maps each Next.js page route to its associated core components, custom hooks, contexts, and nested dependencies.

### 🏠 Home / Landing Page (`/pages/index.js`)
*   **Total Components Involved:** 1 major layout component
*   **File Names & Roles:**
    *   `LandingPage.js` (`/components/LandingPage.js`): The full-screen marketing interface including the hero, supported asset preview, stats, "How it Works" stepper, and footer.
*   **Contexts & Hooks:**
    *   `WalletContext.js` (`/contexts/WalletContext.js` -> `useWallet`): Injected to handle the quick-connect wallet action directly from the Landing page header or call-to-actions.
*   **Composition:** Acts as a lightweight Next.js wrapper passing Web3 connection handlers down into the premium `LandingPage` UI.

### 💧 Faucet Page (`/pages/faucet.js`)
*   **Total Components Involved:** 1 major layout component
*   **File Names & Roles:**
    *   `AppShell.js` (`/components/AppShell.js`): The root application layout wrapping all app routes.
*   **Contexts & Hooks:**
    *   `WalletContext.js` (`/contexts/WalletContext.js` -> `useWallet`, `getMetaMaskEthereum`): Handles Fuji network switching, gasless server-side TUSDC minting, and custom token prompts inside MetaMask.

### 🏆 Leaderboard Page (`/pages/leaderboard.js`)
*   **Total Components Involved:** 1 major layout component
*   **File Names & Roles:**
    *   `AppShell.js` (`/components/AppShell.js`): Global layout frame.
*   **Data Resolution:** Queries the smart contract live for active rounds, sorting pools on-chain.

### 👤 Profile Page (`/pages/profile.js`)
*   **Total Components Involved:** 1 major layout component
*   **File Names & Roles:**
    *   `AppShell.js` (`/components/AppShell.js`): Global layout frame.
*   **Contexts & Hooks:**
    *   `WalletContext.js` (`/contexts/WalletContext.js` -> `useWallet`): Used to fetch personal balances, user claims, and position history.

### 📊 Markets Hub Page (`/pages/markets/index.js`)
*   **Total Components Involved:** 2 major components
*   **File Names & Roles:**
    *   `AppShell.js` (`/components/AppShell.js`): Global layout frame.
    *   `MarketsHub.js` (`/components/MarketsHub.js`): Renders a grid view of active 5-minute prediction rounds.
        *   *Nested utilities:* `AssetIconImg` (`/utils/assetIcons.js`) and `MiniMomentum` (an inline SVG momentum chart showing live vs start prices).
*   *Note:* The standalone `MarketCard.js` (`/components/MarketCard.js`) is currently deprecated and unused, as `MarketsHub` maps items inline.

### 📈 Markets Trade Page (`/pages/markets/trade.js`)
*   **Total Components Involved:** 2 major components
*   **File Names & Roles:**
    *   `AppShell.js` (`/components/AppShell.js`): Global layout frame.
    *   `HumanMarketTerminalV2.js` (`/components/HumanMarketTerminalV2.js`): The heavy manual trading terminal featuring interactive canvas-rendered price charts, order books, sentiment meters, and contract interactors.
        *   *Nested utilities:* `AssetIconImg` (`/utils/assetIcons.js`), `buildTradeAuthMessage` (`/utils/tradeAuth.js`), `signErc2612Permit` (`/utils/tradePermit.js`).
*   **Contexts & Hooks:**
    *   `WalletContext.js` (`/contexts/WalletContext.js` -> `useWallet`): Dictates trade placement authority, token allowances, and wallet signatures.
*   *Note:* `HumanMarketTerminal.js` (V1) is superseded by V2 but still exists in the codebase.

### 🤖 Agent Lobby Page (`/pages/agents/index.js`)
*   **Total Components Involved:** 4 major components
*   **File Names & Roles:**
    *   `AppShell.js` (`/components/AppShell.js`): Global layout frame.
    *   `MyAgentBar.js` (`/components/agents/MyAgentBar.js`): Top persistent status bar displaying active agent enrollment status.
    *   `AgentCard.js` (`/components/agents/AgentCard.js`): Custom preview cards summarizing each trading agent's metrics.
    *   `AgentFeed.js` (`/components/agents/AgentFeed.js`): Live side-panel stream displaying continuous thoughts and trades of active agents.
        *   *Nested utilities:* `agentTime.js` (`/components/agentTime.js`) for timestamp formatting.
*   **Contexts & Hooks:**
    *   `useAgentEnrollment.js` (`/hooks/useAgentEnrollment.js`): Used to detect active enrollee sessions and display relevant header/cta buttons.

### 🔎 Agent Profile Detail Page (`/pages/agents/[id].js`)
*   **Total Components Involved:** 3 major components
*   **File Names & Roles:**
    *   `AppShell.js` (`/components/AppShell.js`): Global layout frame.
    *   `AgentCard.js` (`/components/agents/AgentCard.js`): Enlarged card rendering agent details and traits.
    *   `AgentFeed.js` (`/components/agents/AgentFeed.js`): Filtered feed displaying logs exclusive to the selected agent ID.

### 🖥️ Agent Dashboard Page (`/pages/agents/dashboard.js`)
*   **Total Components Involved:** 3 major components
*   **File Names & Roles:**
    *   `AppShell.js` (`/components/AppShell.js`): Global layout frame.
    *   `MyAgentBar.js` (`/components/agents/MyAgentBar.js`): Persistent upper status bar.
    *   `AgentFeed.js` (`/components/agents/AgentFeed.js`): Displays the transaction logs and AI commentary stream.
*   **Contexts & Hooks:**
    *   `WalletContext.js` (`/contexts/WalletContext.js` -> `useWallet`): Fetches transaction proofs and status parameters relative to the user's connected wallet address.

### ➕ New Agent Creation Page (`/pages/agents/new.js`)
*   **Total Components Involved:** 3 major components
*   **File Names & Roles:**
    *   `AppShell.js` (`/components/AppShell.js`): Global layout frame.
    *   `MyAgentBar.js` (`/components/agents/MyAgentBar.js`): Persistent upper status bar.
    *   `AgentCard.js` (`/components/agents/AgentCard.js`): Used as selection items in the agent picker grid.
*   **Contexts & Hooks:**
    *   `WalletContext.js` (`/contexts/WalletContext.js` -> `useWallet`): Requests permit/allowance approval signatures for delegation.
    *   `useAgentEnrollment.js` (`/hooks/useAgentEnrollment.js`): Checks for active sessions and redirects appropriately.

---

## 4. UI Flow Analysis & Route Optimization

**Current State:** The application relies heavily on distinct page route navigations. Moving from checking your profile, to browsing markets, to placing a trade, to checking the leaderboard requires loading entirely different pages.

**🔥 Critical Improvement Recommendation: Reduce Page Navigations**
To make the application feel like a professional, high-frequency Web3 trading terminal (like Polymarket, Hyperliquid, or Binance), we should migrate towards a more **Single Page Application (SPA) feel**.

*   **Unify the Trading Experience:** Instead of navigating from `/markets` to `/markets/trade?asset=BTC`, the Markets Hub should feature a split-pane or slide-over layout. Clicking a `MarketCard` should instantly load the `HumanMarketTerminal` on the right side of the screen without leaving the `/markets` route.
*   **Consolidate the Agent Hub:** Combine `/agents/index`, `/agents/dashboard`, and `/agents/new` into a single `/agents` route using tabbed navigation.
*   **Use Modals/Drawers for Utilities:** The Faucet (`/faucet`), Profile (`/profile`), and Leaderboard (`/leaderboard`) do not need to be standalone pages. They can be implemented as slide-out drawers or overlay modals accessible directly from the `AppShell` header. This allows users to claim tokens or check their rank without interrupting their trading workflow.

---

## 5. UI/UX & Design System Guidelines for Future Agents

When tasked with upgrading the design and aesthetics, follow these principles:

### A. Establish a Robust Design System
*   **Move away from hardcoded utility colors:** Instead of using arbitrary `bg-red-500` or `bg-[#E84142]`, define a strict set of CSS variables in `globals.css` or the Tailwind config (e.g., `--color-primary`, `--color-surface`, `--color-surface-hover`).
*   **Typography:** The current app uses standard fonts. Introduce a modern, tech-forward font stack (e.g., *Inter*, *Geist*, or *JetBrains Mono* for numbers/tickers).

### B. Elevate the Visual Aesthetics (Premium Web3 Feel)
*   **Glassmorphism & Depth:** The app already uses some `backdrop-blur`. Enhance this by standardizing surface components to have subtle semi-transparent backgrounds with refined inner borders (`ring-1 ring-white/10`).
*   **Glows and Shadows:** Use subtle, colored radial gradients behind key interaction points (like the UP/DOWN prediction buttons) to give a neon, high-energy trading feel.
*   **Empty States & Skeletons:** Implement animated skeleton loaders for the Recharts and Market Cards while data is being fetched from the blockchain.

### C. Improve Micro-Interactions
*   **Animations:** Integrate `framer-motion` for smooth layout transitions (especially if consolidating pages as recommended above). Elements should slide in smoothly.
*   **Feedback:** When a transaction is submitted to the Fuji testnet, provide immediate, satisfying visual feedback (toast notifications, loading spinners on the specific buttons, success confetti).

### D. Mobile Responsiveness
*   The current `AppShell` hides the nav on mobile. Implement a sticky bottom navigation bar for mobile users, ensuring the trading terminal is easily usable with one hand.

### E. Code Health
*   Identify and remove deprecated files (e.g., analyze if `HumanMarketTerminal.js` is fully superseded by `V2`).
*   Ensure all new reusable UI elements (buttons, inputs, cards) are extracted into a generic `/components/ui/` folder to prevent code duplication.
