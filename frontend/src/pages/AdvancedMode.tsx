import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  fetchExchangeStatus, 
  fetchRecentOpportunities, 
  fetchOpportunities,
  pollOpportunities,
  createOpportunityStream,
  ArbitrageEvent 
} from "../api/client";
import TradeDetailModal from "../components/TradeDetailModal";

// Types for simulation
type DataMode = "backtest" | "live";

interface ExchangeConfig {
  name: string;
  displayName: string;
  makerFee: number;
  takerFee: number;
  withdrawalFee: number;
  latencyMs: number;
  liquidityDepth: number;
  balances: { [asset: string]: number };
  connected: boolean;
}

interface BotConfig {
  name: string;
  dataInterval: number;
  connectionType: "websocket" | "rest";
  minSpreadThreshold: number;
  includeTransferFees: boolean;
  slippageAssumption: number;
  executionType: "market" | "limit";
  maxBalancePercent: number;
  enableTriangular: boolean;
  triangularThreshold: number;
}

interface SimulationTrade {
  id: string;
  timestamp: number;
  type: "spatial" | "triangular";
  buyExchange: string;
  sellExchange: string;
  asset: string;
  buyPrice: number;
  sellPrice: number;
  amount: number;
  grossProfit: number;
  fees: number;
  slippage: number;
  latencyCost: number;
  netProfit: number;
  executionTimeMs: number;
  status: "success" | "partial" | "failed" | "timeout";
  sourceOpportunityId?: number;
}

interface LockedFunds {
  id: string;
  exchange: string;
  asset: string;
  amount: number;
  lockedAt: number;
  unlockAt: number;
  tradeId: string;
  reason: "pending_settlement" | "withdrawal_cooldown" | "transfer_in_progress";
}

interface SimulationState {
  isRunning: boolean;
  isPaused: boolean;
  speed: number;
  currentTime: number;
  startTime: number;
  trades: SimulationTrade[];
  totalPnL: number;
  latencyMode: "constant" | "random" | "exchange-dependent";
  stressTestEnabled: boolean;
  lockedFunds: LockedFunds[];
  settlementDelayMs: number; // How long funds stay locked after trade
}

interface BacktestConfig {
  startDate: string;
  endDate: string;
  currentIndex: number;
  data: ArbitrageEvent[];
}

const DEFAULT_EXCHANGES: ExchangeConfig[] = [
  { name: "binance", displayName: "Binance", makerFee: 0.1, takerFee: 0.1, withdrawalFee: 0.0005, latencyMs: 15, liquidityDepth: 100, balances: { BTC: 5, ETH: 50, USDT: 100000 }, connected: true },
  { name: "kraken", displayName: "Kraken", makerFee: 0.16, takerFee: 0.26, withdrawalFee: 0.0005, latencyMs: 45, liquidityDepth: 60, balances: { BTC: 3, ETH: 30, USDT: 50000 }, connected: true },
  { name: "coinbase", displayName: "Coinbase", makerFee: 0.4, takerFee: 0.6, withdrawalFee: 0.0001, latencyMs: 35, liquidityDepth: 80, balances: { BTC: 2, ETH: 20, USDT: 30000 }, connected: true },
];

const DEFAULT_BOT_CONFIG: BotConfig = {
  name: "Untitled Strategy",
  dataInterval: 50,
  connectionType: "websocket",
  minSpreadThreshold: 0.01,
  includeTransferFees: true,
  slippageAssumption: 0.05,
  executionType: "market",
  maxBalancePercent: 20,
  enableTriangular: false,
  triangularThreshold: 0.2,
};

const DATA_MODE_INFO = {
  backtest: {
    title: "Backtest",
    description: "Replay historical opportunities at adjustable speed",
    color: "var(--accent-yellow)",
  },
  live: {
    title: "Live Paper",
    description: "Real-time polling of actual exchange opportunities (configurable)",
    color: "var(--accent-red)",
  },
};

export default function AdvancedMode() {
  // Data mode state
  const [dataMode, setDataMode] = useState<DataMode>("backtest");
  
  // Core state
  const [exchanges, setExchanges] = useState<ExchangeConfig[]>(DEFAULT_EXCHANGES);
  const [botConfig, setBotConfig] = useState<BotConfig>(DEFAULT_BOT_CONFIG);
  const [simulation, setSimulation] = useState<SimulationState>({
    isRunning: false,
    isPaused: false,
    speed: 1,
    currentTime: Date.now(),
    startTime: Date.now(),
    trades: [],
    totalPnL: 0,
    latencyMode: "exchange-dependent",
    stressTestEnabled: false,
    lockedFunds: [],
    settlementDelayMs: 2000, // 2 seconds default settlement time
  });
  
  // Backtest state
  const [backtestConfig, setBacktestConfig] = useState<BacktestConfig>({
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    currentIndex: 0,
    data: [],
  });
  const [isLoadingBacktest, setIsLoadingBacktest] = useState(false);
  
  // Live mode state  
  const [liveOpportunities, setLiveOpportunities] = useState<ArbitrageEvent[]>([]);
  const [processedLiveIds, setProcessedLiveIds] = useState<Set<number>>(new Set());
  const livePollingRef = useRef<number | null>(null);
  const lastLiveIdRef = useRef(0);
  const isLivePollingRef = useRef(false);
  
  // Configurable settings
  const [opportunityLimit, setOpportunityLimit] = useState(50);
  const [pollingInterval, setPollingInterval] = useState(200);
  const [backtestLimit, setBacktestLimit] = useState(1000);
  
  // UI state
  const [activeTab, setActiveTab] = useState<"builder" | "monitor" | "analytics">("builder");
  const [selectedTrade, setSelectedTrade] = useState<SimulationTrade | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<{ name: string; config: BotConfig }[]>([
    { name: "CrossExchange v1: Binance-Kraken Spread Hunter", config: { ...DEFAULT_BOT_CONFIG, minSpreadThreshold: 0.5 } },
    { name: "TriArb v2: ETH-BTC-USDT Cycle Explorer", config: { ...DEFAULT_BOT_CONFIG, enableTriangular: true, triangularThreshold: 0.3 } },
  ]);
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState<ArbitrageEvent | null>(null);

  const simulationRef = useRef<number | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Fetch real exchange status
  const { data: realExchanges } = useQuery({
    queryKey: ["exchange-status"],
    queryFn: fetchExchangeStatus,
  });

  const { data: realOpportunities } = useQuery({
    queryKey: ["advanced-opportunities"],
    queryFn: () => fetchRecentOpportunities(60),
    refetchInterval: 10000,
  });


  // Calculate available (unlocked) balance for an exchange/asset
  // In backtest mode, we don't use fund locking (instant settlement assumed)
  const getAvailableBalance = useCallback((exchangeName: string, asset: string): number => {
    const exchange = exchanges.find(e => e.name === exchangeName);
    if (!exchange) return 0;
    
    const totalBalance = exchange.balances[asset] || 0;
    
    // Skip fund locking in backtest mode - assume instant settlement
    if (dataMode === "backtest") {
      return totalBalance;
    }
    
    const lockedAmount = simulation.lockedFunds
      .filter(lf => lf.exchange === exchangeName && lf.asset === asset && lf.unlockAt > simulation.currentTime)
      .reduce((sum, lf) => sum + lf.amount, 0);
    
    return Math.max(0, totalBalance - lockedAmount);
  }, [exchanges, simulation.lockedFunds, simulation.currentTime, dataMode]);

  // Lock funds when a trade is executed
  const lockFundsForTrade = useCallback((trade: SimulationTrade): LockedFunds[] => {
    const locks: LockedFunds[] = [];
    const now = simulation.currentTime;
    const unlockTime = now + simulation.settlementDelayMs;
    
    // Lock USDT on buy exchange (cost of purchase)
    const buyCost = trade.buyPrice * trade.amount;
    locks.push({
      id: `lock-${trade.id}-buy`,
      exchange: trade.buyExchange,
      asset: "USDT",
      amount: buyCost,
      lockedAt: now,
      unlockAt: unlockTime,
      tradeId: trade.id,
      reason: "pending_settlement",
    });
    
    // Lock the asset on sell exchange (what we're selling)
    locks.push({
      id: `lock-${trade.id}-sell`,
      exchange: trade.sellExchange,
      asset: trade.asset,
      amount: trade.amount,
      lockedAt: now,
      unlockAt: unlockTime,
      tradeId: trade.id,
      reason: "pending_settlement",
    });
    
    return locks;
  }, [simulation.currentTime, simulation.settlementDelayMs]);

  // Clean up expired locks (funds that have settled)
  const cleanupExpiredLocks = useCallback(() => {
    setSimulation(prev => ({
      ...prev,
      lockedFunds: prev.lockedFunds.filter(lf => lf.unlockAt > prev.currentTime),
    }));
  }, []);

  // Check if we have sufficient available funds for a trade
  const canExecuteTrade = useCallback((
    buyExchange: string,
    sellExchange: string,
    asset: string,
    amount: number,
    buyPrice: number
  ): { canExecute: boolean; reason?: string } => {
    const requiredUSDT = buyPrice * amount;
    const availableUSDT = getAvailableBalance(buyExchange, "USDT");
    
    if (availableUSDT < requiredUSDT) {
      return { 
        canExecute: false, 
        reason: `Insufficient USDT on ${buyExchange}: need ${requiredUSDT.toFixed(2)}, available ${availableUSDT.toFixed(2)} (${(availableUSDT / requiredUSDT * 100).toFixed(0)}% of required)` 
      };
    }
    
    const availableAsset = getAvailableBalance(sellExchange, asset);
    if (availableAsset < amount) {
      return { 
        canExecute: false, 
        reason: `Insufficient ${asset} on ${sellExchange}: need ${amount.toFixed(6)}, available ${availableAsset.toFixed(6)}` 
      };
    }
    
    return { canExecute: true };
  }, [getAvailableBalance]);

  // Convert real opportunity to simulated trade (with fund locking)
  const processRealOpportunity = useCallback((opp: ArbitrageEvent): { trade: SimulationTrade; locks: LockedFunds[] } | null => {
    const spread = parseFloat(opp.spread_pct);
    if (spread < botConfig.minSpreadThreshold) return null;
    
    const buyPrice = parseFloat(opp.buy_price);
    const sellPrice = parseFloat(opp.sell_price);
    const buyEx = exchanges.find(e => e.name.toLowerCase() === opp.buy_exchange_name.toLowerCase()) || exchanges[0];
    const sellEx = exchanges.find(e => e.name.toLowerCase() === opp.sell_exchange_name.toLowerCase()) || exchanges[1];
    
    // Skip if either exchange is disabled
    if (!buyEx.connected || !sellEx.connected) {
      return null;
    }
    
    // Extract asset symbol (e.g., "BTC" from "BTC/USDT")
    const asset = opp.asset.split("/")[0] || opp.asset;
    
    // Use AVAILABLE balance (total - locked) instead of total balance
    const availableUSDT = getAvailableBalance(buyEx.name, "USDT");
    const availableAsset = getAvailableBalance(sellEx.name, asset);
    
    const maxAmount = Math.min(
      parseFloat(opp.buy_qty_available) || 1,
      parseFloat(opp.sell_qty_available) || 1,
      availableUSDT / buyPrice * (botConfig.maxBalancePercent / 100),
      availableAsset * (botConfig.maxBalancePercent / 100)
    );
    
    // Can't execute if no available funds
    if (maxAmount <= 0.0001) {
      return null;
    }
    
    const amount = Math.max(0.001, maxAmount * (0.5 + Math.random() * 0.5));
    
    // Final check: can we actually execute this trade?
    const fundCheck = canExecuteTrade(buyEx.name, sellEx.name, asset, amount, buyPrice);
    if (!fundCheck.canExecute) {
      // Log why we skipped this trade
      console.log(`[FundLock] Skipping trade: ${fundCheck.reason}`);
      return null;
    }
    
    const grossProfit = (sellPrice - buyPrice) * amount;
    const fees = (buyPrice * amount * buyEx.takerFee / 100) + (sellPrice * amount * sellEx.takerFee / 100);
    const slippage = grossProfit * (botConfig.slippageAssumption / 100);
    
    let latency = buyEx.latencyMs + sellEx.latencyMs;
    if (simulation.latencyMode === "random") {
      latency += Math.random() * 100;
    }
    const latencyCost = grossProfit * (latency / 1000) * 0.1;
    
    const netProfit = grossProfit - fees - slippage - latencyCost;
    
    let status: SimulationTrade["status"] = "success";
    if (simulation.stressTestEnabled && Math.random() < 0.15) {
      status = Math.random() < 0.5 ? "failed" : "timeout";
    } else if (Math.random() < 0.05) {
      status = "partial";
    }
    
    const trade: SimulationTrade = {
      id: `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(opp.detected_at).getTime(),
      type: "spatial",
      buyExchange: opp.buy_exchange_name,
      sellExchange: opp.sell_exchange_name,
      asset,
      buyPrice,
      sellPrice,
      amount,
      grossProfit,
      fees,
      slippage,
      latencyCost,
      netProfit: status === "success" ? netProfit : status === "partial" ? netProfit * 0.4 : 0,
      executionTimeMs: latency,
      status,
      sourceOpportunityId: opp.id,
    };
    
    // Create fund locks for this trade
    const locks = lockFundsForTrade(trade);
    
    return { trade, locks };
  }, [exchanges, botConfig, simulation.latencyMode, simulation.stressTestEnabled, getAvailableBalance, canExecuteTrade, lockFundsForTrade]);

  // Load backtest data
  const loadBacktestData = useCallback(async () => {
    setIsLoadingBacktest(true);
    try {
      const response = await fetchOpportunities({ ordering: "detected_at", limit: backtestLimit });
      setBacktestConfig(prev => ({
        ...prev,
        data: response.results,
        currentIndex: 0,
      }));
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Loaded ${response.results.length} historical opportunities for backtest`]);
    } catch (error) {
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: Failed to load backtest data`]);
    }
    setIsLoadingBacktest(false);
  }, [backtestLimit]);

  // EventSource ref for SSE streaming
  const eventSourceRef = useRef<EventSource | null>(null);

  // Start live data feed (SSE for WebSocket mode, REST polling for REST mode)
  const startLivePolling = useCallback(() => {
    if (livePollingRef.current || isLivePollingRef.current || eventSourceRef.current) {
      return;
    }

    isLivePollingRef.current = true;

    if (botConfig.connectionType === "websocket") {
      // Use Server-Sent Events for real-time streaming
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Starting SSE stream (real-time push)...`]);
      
      eventSourceRef.current = createOpportunityStream(
        lastLiveIdRef.current,
        (data) => {
          if (data.opportunities && data.opportunities.length > 0) {
            lastLiveIdRef.current = data.latest_id;
            setLiveOpportunities(prev => [...prev.slice(-opportunityLimit), ...data.opportunities]);
            setLogs(prev => [...prev.slice(-199), `[${new Date().toLocaleTimeString()}] SSE: Received ${data.opportunities.length} opportunities (ID: ${data.latest_id})`]);
          }
        },
        (error) => {
          console.error("SSE error:", error);
          setLogs(prev => [...prev.slice(-199), `[${new Date().toLocaleTimeString()}] SSE connection error - will auto-reconnect`]);
        }
      );
      
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] SSE stream connected - real-time mode active`]);
    } else {
      // Use REST polling
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Starting REST polling (${pollingInterval}ms interval)...`]);
      
      const pollLiveData = async () => {
        if (!isLivePollingRef.current) return;
        
        try {
          const response = await pollOpportunities({
            sinceId: lastLiveIdRef.current,
            limit: opportunityLimit,
            includeSimulated: true,
          });
          
          if (response.opportunities && response.opportunities.length > 0) {
            lastLiveIdRef.current = response.latest_id;
            setLiveOpportunities(prev => [...prev.slice(-opportunityLimit), ...response.opportunities]);
            setLogs(prev => [...prev.slice(-199), `[${new Date().toLocaleTimeString()}] REST: Received ${response.opportunities.length} opportunities (ID: ${response.latest_id})`]);
          }
        } catch (error) {
          console.error("REST poll error:", error);
        }
      };

      pollLiveData();
      
      const effectiveInterval = Math.max(50, Math.round(pollingInterval / simulation.speed));
      livePollingRef.current = window.setInterval(pollLiveData, effectiveInterval);
      
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] REST polling active at ${simulation.speed}x speed (${effectiveInterval}ms)`]);
    }
  }, [opportunityLimit, pollingInterval, simulation.speed, botConfig.connectionType]);

  // Stop live data feed
  const stopLivePolling = useCallback(() => {
    isLivePollingRef.current = false;
    
    // Stop REST polling
    if (livePollingRef.current) {
      clearInterval(livePollingRef.current);
      livePollingRef.current = null;
    }
    
    // Close SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Process live opportunities
  useEffect(() => {
    if (dataMode !== "live" || !simulation.isRunning || simulation.isPaused) return;
    
    const newOpportunities = liveOpportunities.filter(opp => !processedLiveIds.has(opp.id));
    
    if (newOpportunities.length > 0) {
      const newTrades: SimulationTrade[] = [];
      const newLocks: LockedFunds[] = [];
      const newProcessedIds = new Set(processedLiveIds);
      
      for (const opp of newOpportunities) {
        const result = processRealOpportunity(opp);
        if (result) {
          newTrades.push(result.trade);
          newLocks.push(...result.locks);
          const logEntry = `[${new Date().toLocaleTimeString()}] LIVE ${result.trade.status.toUpperCase()}: ${result.trade.asset} | ${result.trade.buyExchange} → ${result.trade.sellExchange} | Spread: ${parseFloat(opp.spread_pct).toFixed(3)}% | Net: $${result.trade.netProfit.toFixed(4)} | Funds locked for ${simulation.settlementDelayMs / 1000}s`;
          setLogs(prev => [...prev.slice(-199), logEntry]);
        }
        newProcessedIds.add(opp.id);
      }
      
      if (newTrades.length > 0) {
        setSimulation(prev => ({
          ...prev,
          trades: [...prev.trades.slice(-99), ...newTrades],
          totalPnL: prev.totalPnL + newTrades.reduce((sum, t) => sum + t.netProfit, 0),
          lockedFunds: [...prev.lockedFunds, ...newLocks],
        }));
      }
      
      setProcessedLiveIds(newProcessedIds);
    }
  }, [dataMode, simulation.isRunning, simulation.isPaused, liveOpportunities, processedLiveIds, processRealOpportunity, simulation.settlementDelayMs]);

  // Main simulation loop (Backtest mode)
  useEffect(() => {
    if (!simulation.isRunning || simulation.isPaused || dataMode === "live") {
      if (simulationRef.current) {
        clearInterval(simulationRef.current);
        simulationRef.current = null;
      }
      return;
    }

    if (dataMode === "backtest") {
      // Backtest mode: replay historical data (no fund locking - instant settlement)
      const tickInterval = Math.max(100, 1000 / simulation.speed);
      
      simulationRef.current = window.setInterval(() => {
        setBacktestConfig(prev => {
          if (prev.currentIndex >= prev.data.length) {
            setSimulation(s => ({ ...s, isRunning: false }));
            setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] Backtest complete. Processed ${prev.data.length} opportunities.`]);
            return prev;
          }
          
          const opp = prev.data[prev.currentIndex];
          const result = processRealOpportunity(opp);
          
          if (result) {
            setSimulation(s => ({
              ...s,
              currentTime: result.trade.timestamp,
              trades: [...s.trades.slice(-99), result.trade],
              totalPnL: s.totalPnL + result.trade.netProfit,
              // No fund locking in backtest mode - instant settlement
            }));
            
            const logEntry = `[${new Date(result.trade.timestamp).toLocaleTimeString()}] BACKTEST ${result.trade.status.toUpperCase()}: ${result.trade.asset} | ${result.trade.buyExchange} → ${result.trade.sellExchange} | Net: $${result.trade.netProfit.toFixed(4)}`;
            setLogs(l => [...l.slice(-199), logEntry]);
          } else {
            setLogs(l => [...l.slice(-199), `[${new Date().toLocaleTimeString()}] BACKTEST SKIPPED: ${opp.asset} - Below spread threshold`]);
          }
          
          return { ...prev, currentIndex: prev.currentIndex + 1 };
        });
      }, tickInterval);
    }

    return () => {
      if (simulationRef.current) {
        clearInterval(simulationRef.current);
      }
    };
  }, [simulation.isRunning, simulation.isPaused, simulation.speed, dataMode, processRealOpportunity]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLivePolling();
    };
  }, [stopLivePolling]);

  // Restart polling when speed changes during live mode (only for REST mode)
  useEffect(() => {
    if (dataMode === "live" && simulation.isRunning && !simulation.isPaused && botConfig.connectionType === "rest") {
      stopLivePolling();
      startLivePolling();
    }
  }, [simulation.speed]);

  // Continuously update time in live mode to process fund unlocks
  useEffect(() => {
    if (dataMode === "live" && simulation.isRunning && !simulation.isPaused) {
      const timeUpdateInterval = window.setInterval(() => {
        setSimulation(prev => ({
          ...prev,
          currentTime: Date.now(),
        }));
        cleanupExpiredLocks();
      }, 100); // Update time every 100ms
      
      return () => clearInterval(timeUpdateInterval);
    }
  }, [dataMode, simulation.isRunning, simulation.isPaused, cleanupExpiredLocks]);

  const startSimulation = async () => {
    if (dataMode === "backtest" && backtestConfig.data.length === 0) {
      await loadBacktestData();
    }
    
    if (dataMode === "live") {
      lastLiveIdRef.current = 0;
      setProcessedLiveIds(new Set());
      setLiveOpportunities([]);
      startLivePolling();
    }
    
    setSimulation(prev => ({
      ...prev,
      isRunning: true,
      isPaused: false,
      startTime: Date.now(),
      currentTime: Date.now(),
      trades: [],
      totalPnL: 0,
      lockedFunds: [], // Clear all locked funds on restart
    }));
    
    if (dataMode === "backtest") {
      setBacktestConfig(prev => ({ ...prev, currentIndex: 0 }));
    }
    
    setLogs([`[${new Date().toLocaleTimeString()}] ${DATA_MODE_INFO[dataMode].title} simulation started with config: ${botConfig.name}`]);
  };

  const stopSimulation = () => {
    if (dataMode === "live") {
      stopLivePolling();
    }
    setSimulation(prev => ({ ...prev, isRunning: false, isPaused: false }));
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Simulation stopped. Total P/L: $${simulation.totalPnL.toFixed(4)}`]);
  };

  const togglePause = () => {
    setSimulation(prev => ({ ...prev, isPaused: !prev.isPaused }));
  };

  const setSpeed = (speed: number) => {
    setSimulation(prev => ({ ...prev, speed }));
  };

  const saveProfile = () => {
    const name = prompt("Enter profile name:", botConfig.name);
    if (name) {
      setSavedProfiles(prev => [...prev, { name, config: { ...botConfig, name } }]);
    }
  };

  const loadProfile = (profile: { name: string; config: BotConfig }) => {
    setBotConfig(profile.config);
  };

  const updateBotConfig = <K extends keyof BotConfig>(key: K, value: BotConfig[K]) => {
    setBotConfig(prev => ({ ...prev, [key]: value }));
  };

  const updateExchange = (index: number, updates: Partial<ExchangeConfig>) => {
    setExchanges(prev => prev.map((ex, i) => i === index ? { ...ex, ...updates } : ex));
  };

  // Calculate analytics
  const analytics = {
    totalTrades: simulation.trades.length,
    successfulTrades: simulation.trades.filter(t => t.status === "success").length,
    failedTrades: simulation.trades.filter(t => t.status === "failed" || t.status === "timeout").length,
    avgExecutionTime: simulation.trades.length > 0 
      ? simulation.trades.reduce((a, b) => a + b.executionTimeMs, 0) / simulation.trades.length 
      : 0,
    totalFees: simulation.trades.reduce((a, b) => a + b.fees, 0),
    totalSlippage: simulation.trades.reduce((a, b) => a + b.slippage, 0),
    sharpeRatio: simulation.trades.length > 5 
      ? (simulation.totalPnL / simulation.trades.length) / (Math.sqrt(simulation.trades.map(t => t.netProfit).reduce((a, b) => a + Math.pow(b - simulation.totalPnL / simulation.trades.length, 2), 0) / simulation.trades.length) || 1)
      : 0,
    winRate: simulation.trades.length > 0 
      ? (simulation.trades.filter(t => t.netProfit > 0).length / simulation.trades.length) * 100 
      : 0,
  };

  return (
    <div className="advanced-mode">
      {/* Header */}
      <div className="advanced-header">
        <div className="header-left">
          <h1 className="advanced-title">
            Advanced Mode
          </h1>
          <span className="advanced-subtitle">Arbitrage Simulation Environment</span>
        </div>
        <div className="header-right">
          <div className="sim-time">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            {new Date(simulation.currentTime).toLocaleTimeString()}
          </div>
          {simulation.lockedFunds.length > 0 && (
            <div className="locked-funds-indicator" title={`${simulation.lockedFunds.length} active fund locks`}>
              <span className="lock-count">{simulation.lockedFunds.length}</span>
              <span className="lock-label">Locked</span>
            </div>
          )}
        </div>
      </div>

      {/* Data Mode Selector */}
      <div className="data-mode-selector">
        {(Object.keys(DATA_MODE_INFO) as DataMode[]).map(mode => (
          <button
            key={mode}
            className={`mode-card ${dataMode === mode ? "active" : ""} ${simulation.isRunning ? "disabled" : ""}`}
            onClick={() => !simulation.isRunning && setDataMode(mode)}
            disabled={simulation.isRunning}
            style={{ "--mode-color": DATA_MODE_INFO[mode].color } as React.CSSProperties}
          >
            <div className="mode-info">
              <span className="mode-title">{DATA_MODE_INFO[mode].title}</span>
              <span className="mode-desc">{DATA_MODE_INFO[mode].description}</span>
            </div>
            {dataMode === mode && <span className="mode-check">*</span>}
          </button>
        ))}
      </div>


      {/* Live Mode Status */}
      {dataMode === "live" && simulation.isRunning && (
        <div className="live-status-bar">
          <div className="live-indicator">
            <span className="live-dot" />
            LIVE
          </div>
          <span className="live-info">
            {botConfig.connectionType === "websocket" 
              ? `SSE Stream (real-time push)` 
              : `REST Polling (${Math.round(pollingInterval / simulation.speed)}ms)`
            } • Limit: {opportunityLimit} • {liveOpportunities.length} received • {processedLiveIds.size} processed
          </span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="advanced-tabs">
        <button 
          className={`tab-btn ${activeTab === "builder" ? "active" : ""}`}
          onClick={() => setActiveTab("builder")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          Bot Builder
        </button>
        <button 
          className={`tab-btn ${activeTab === "monitor" ? "active" : ""}`}
          onClick={() => setActiveTab("monitor")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
          Live Monitor
        </button>
        <button 
          className={`tab-btn ${activeTab === "analytics" ? "active" : ""}`}
          onClick={() => setActiveTab("analytics")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M18 20V10M12 20V4M6 20v-6"/>
          </svg>
          Analytics
        </button>
      </div>

      {/* Main Content */}
      <div className="advanced-content">
        {/* Left Panel - Exchanges */}
        <div className="panel exchange-panel">
          <div className="panel-header">
            <h3>Exchanges</h3>
            <span className="panel-badge">{exchanges.filter(e => e.connected).length} Active</span>
          </div>
          <div className="exchange-matrix">
            {exchanges.map((ex, idx) => (
              <div key={ex.name} className={`exchange-row ${ex.connected ? "connected" : "disconnected"}`}>
                <div className="exchange-info">
                  <span className={`status-dot ${ex.connected ? "connected" : "disconnected"}`} />
                  <span className="exchange-name">{ex.displayName}</span>
                  <span className="exchange-fee">{ex.takerFee}%</span>
                </div>
                <button 
                  className="btn btn-sm btn-ghost"
                  onClick={() => updateExchange(idx, { connected: !ex.connected })}
                >
                  {ex.connected ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Center Panel - Tab Content */}
        <div className="panel main-panel">
          {activeTab === "builder" && (
            <div className="bot-builder">
              <div className="builder-header">
                <input
                  type="text"
                  className="strategy-name-input"
                  value={botConfig.name}
                  onChange={(e) => updateBotConfig("name", e.target.value)}
                  placeholder="Strategy Name"
                  disabled={simulation.isRunning}
                />
                <div className="builder-actions">
                  <button className="btn btn-secondary btn-sm" onClick={saveProfile} disabled={simulation.isRunning}>
                    Save Profile
                  </button>
                  <select 
                    className="profile-select"
                    onChange={(e) => {
                      const profile = savedProfiles.find(p => p.name === e.target.value);
                      if (profile) loadProfile(profile);
                    }}
                    value=""
                    disabled={simulation.isRunning}
                  >
                    <option value="" disabled>Load Profile...</option>
                    {savedProfiles.map(p => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="module-grid">
                {/* Market Data Streamer */}
                <div className="module-card">
                  <div className="module-header">
                    <h4>Market Data Streamer</h4>
                  </div>
                  <div className="module-content">
                    <div className="form-group">
                      <label>Data Interval {dataMode === "live" && "(Live mode: real-time)"}</label>
                      <div className="input-with-suffix">
                        <input
                          type="text"
                          value={botConfig.dataInterval}
                          onChange={(e) => updateBotConfig("dataInterval", parseInt(e.target.value) || 50)}
                          disabled={simulation.isRunning}
                        />
                        <span>ms</span>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Connection Type</label>
                      <div className="toggle-group">
                        <button 
                          className={`toggle-btn ${botConfig.connectionType === "websocket" ? "active" : ""}`}
                          onClick={() => updateBotConfig("connectionType", "websocket")}
                          disabled={simulation.isRunning}
                        >
                          WebSocket
                        </button>
                        <button 
                          className={`toggle-btn ${botConfig.connectionType === "rest" ? "active" : ""}`}
                          onClick={() => updateBotConfig("connectionType", "rest")}
                          disabled={simulation.isRunning}
                        >
                          REST
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Signal Engine */}
                <div className="module-card">
                  <div className="module-header">
                    <h4>Signal Engine</h4>
                  </div>
                  <div className="module-content">
                    <div className="form-group">
                      <label>Min Spread Threshold</label>
                      <div className="input-with-suffix">
                        <input
                          type="text"
                          value={botConfig.minSpreadThreshold}
                          onChange={(e) => updateBotConfig("minSpreadThreshold", parseFloat(e.target.value) || 0.1)}
                          disabled={simulation.isRunning}
                        />
                        <span>%</span>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={botConfig.includeTransferFees}
                          onChange={(e) => updateBotConfig("includeTransferFees", e.target.checked)}
                          disabled={simulation.isRunning}
                        />
                        Include Transfer Fees
                      </label>
                    </div>
                    <div className="form-group">
                      <label>Slippage Assumption</label>
                      <div className="input-with-suffix">
                        <input
                          type="text"
                          value={botConfig.slippageAssumption}
                          onChange={(e) => updateBotConfig("slippageAssumption", parseFloat(e.target.value) || 0)}
                          disabled={simulation.isRunning}
                        />
                        <span>%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Execution Logic */}
                <div className="module-card">
                  <div className="module-header">
                    <h4>Execution Logic</h4>
                  </div>
                  <div className="module-content">
                    <div className="form-group">
                      <label>Order Type</label>
                      <div className="toggle-group">
                        <button 
                          className={`toggle-btn ${botConfig.executionType === "market" ? "active" : ""}`}
                          onClick={() => updateBotConfig("executionType", "market")}
                          disabled={simulation.isRunning}
                        >
                          Market (Speed)
                        </button>
                        <button 
                          className={`toggle-btn ${botConfig.executionType === "limit" ? "active" : ""}`}
                          onClick={() => updateBotConfig("executionType", "limit")}
                          disabled={simulation.isRunning}
                        >
                          Limit (Price)
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Max Balance %</label>
                      <div className="input-with-suffix">
                        <input
                          type="text"
                          value={botConfig.maxBalancePercent}
                          onChange={(e) => updateBotConfig("maxBalancePercent", parseInt(e.target.value) || 10)}
                          disabled={simulation.isRunning}
                        />
                        <span>%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Capital Allocation */}
                <div className="module-card capital-module">
                  <div className="module-header">
                    <h4>Capital Allocation</h4>
                    <span className="total-capital">
                      ${(exchanges.reduce((sum, ex) => sum + ex.balances.USDT + ex.balances.BTC * 42000 + ex.balances.ETH * 2200, 0) / 1000).toFixed(0)}k
                    </span>
                  </div>
                  <div className="module-content">
                    <div className="capital-editor">
                      {exchanges.map((ex, idx) => (
                        <div key={ex.name} className={`capital-edit-row ${!ex.connected ? "disabled" : ""}`}>
                          <div className="col-exchange">
                            <span className={`status-dot ${ex.connected ? "connected" : "disconnected"}`} />
                            {ex.displayName}
                          </div>
                          <div className="col-balance">
                            <input
                              type="text"
                              value={ex.balances.BTC}
                              onChange={(e) => updateExchange(idx, { 
                                balances: { ...ex.balances, BTC: parseFloat(e.target.value) || 0 }
                              })}
                              disabled={simulation.isRunning}
                              title="BTC"
                            />
                          </div>
                          <div className="col-balance">
                            <input
                              type="text"
                              value={ex.balances.ETH}
                              onChange={(e) => updateExchange(idx, { 
                                balances: { ...ex.balances, ETH: parseFloat(e.target.value) || 0 }
                              })}
                              disabled={simulation.isRunning}
                              title="ETH"
                            />
                          </div>
                          <div className="col-balance">
                            <input
                              type="text"
                              value={ex.balances.USDT}
                              onChange={(e) => updateExchange(idx, { 
                                balances: { ...ex.balances, USDT: parseFloat(e.target.value) || 0 }
                              })}
                              disabled={simulation.isRunning}
                              title="USDT"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="capital-labels">
                      <span></span>
                      <span>BTC</span>
                      <span>ETH</span>
                      <span>USDT</span>
                    </div>
                  </div>
                </div>

                {/* Strategy Designer */}
                <div className="module-card">
                  <div className="module-header">
                    <h4>Strategy Designer</h4>
                  </div>
                  <div className="module-content">
                    <div className="form-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={botConfig.enableTriangular}
                          onChange={(e) => updateBotConfig("enableTriangular", e.target.checked)}
                          disabled={simulation.isRunning}
                        />
                        Enable Triangular Arbitrage
                      </label>
                    </div>
                    {botConfig.enableTriangular && (
                      <div className="form-group">
                        <label>Triangular Threshold</label>
                        <div className="input-with-suffix">
                          <input
                            type="text"
                            value={botConfig.triangularThreshold}
                            onChange={(e) => updateBotConfig("triangularThreshold", parseFloat(e.target.value) || 0.1)}
                            disabled={simulation.isRunning}
                          />
                          <span>%</span>
                        </div>
                      </div>
                    )}
                    <div className="strategy-preview">
                      <span className="preview-label">Active Rule:</span>
                      <code>
                        IF spread &gt; {botConfig.minSpreadThreshold}% AFTER fees
                        THEN execute up to {botConfig.maxBalancePercent}% balance
                      </code>
                    </div>
                  </div>
                </div>

                {/* Simulation Controls */}
                <div className="module-card simulation-controls">
                  <div className="module-header">
                    <h4>Simulation Controls</h4>
                  </div>
                  <div className="module-content">
                    <div className="form-group">
                      <label>Latency Model</label>
                      <select 
                        value={simulation.latencyMode}
                        onChange={(e) => setSimulation(prev => ({ ...prev, latencyMode: e.target.value as SimulationState["latencyMode"] }))}
                        disabled={simulation.isRunning}
                      >
                        <option value="constant">Constant</option>
                        <option value="random">Random Jitter</option>
                        <option value="exchange-dependent">Exchange-Dependent</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Settlement Delay (Fund Lock)</label>
                      <div className="input-with-suffix">
                        <input
                          type="text"
                          value={simulation.settlementDelayMs / 1000}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 2;
                            // Allow 0 for instant settlement, otherwise minimum 2 seconds
                            const finalVal = val === 0 ? 0 : Math.max(2, val);
                            setSimulation(prev => ({ 
                              ...prev, 
                              settlementDelayMs: finalVal * 1000 
                            }));
                          }}
                          disabled={simulation.isRunning}
                        />
                        <span>sec</span>
                      </div>
                      <span className="hint">How long funds are locked after each trade (0 = instant, min: 2s)</span>
                    </div>
                    <div className="form-group">
                      <label>Opportunity Limit (per poll)</label>
                      <div className="input-with-suffix">
                        <input
                          type="text"
                          value={opportunityLimit}
                          onChange={(e) => setOpportunityLimit(parseInt(e.target.value) || 50)}
                          disabled={simulation.isRunning}
                        />
                        <span>opps</span>
                      </div>
                      <span className="hint">Max opportunities to fetch per poll cycle</span>
                    </div>
                    {dataMode === "live" && (
                      <div className="form-group">
                        <label>Polling Interval</label>
                        <div className="input-with-suffix">
                          <input
                            type="text"
                            value={pollingInterval}
                            onChange={(e) => setPollingInterval(parseInt(e.target.value) || 200)}
                            disabled={simulation.isRunning}
                          />
                          <span>ms</span>
                        </div>
                        <span className="hint">Lower = faster but more API calls</span>
                      </div>
                    )}
                    {dataMode === "backtest" && (
                      <div className="form-group">
                        <label>Backtest Event Limit</label>
                        <div className="input-with-suffix">
                          <input
                            type="text"
                            value={backtestLimit}
                            onChange={(e) => setBacktestLimit(parseInt(e.target.value) || 500)}
                            disabled={simulation.isRunning}
                          />
                          <span>events</span>
                        </div>
                        <span className="hint">Number of historical events to load (max 10,000)</span>
                      </div>
                    )}
                    <div className="form-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={simulation.stressTestEnabled}
                          onChange={(e) => setSimulation(prev => ({ ...prev, stressTestEnabled: e.target.checked }))}
                          disabled={simulation.isRunning}
                        />
                        Enable Stress Testing
                      </label>
                      <span className="hint">Inject failures, timeouts, flash crashes</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === "monitor" && (
            <div className="live-monitor">
              {/* Funds Breakdown */}
              <div className="funds-breakdown">
                <div className="funds-header">
                  <h4>Funds Status</h4>
                  <span className="funds-total">
                    Total: ${exchanges.reduce((sum, ex) => sum + ex.balances.USDT + ex.balances.BTC * 42000 + ex.balances.ETH * 2200, 0).toLocaleString()}
                  </span>
                </div>
                <div className="funds-grid">
                  {exchanges.filter(ex => ex.connected).map(ex => {
                    const lockedUSDT = simulation.lockedFunds
                      .filter(lf => lf.exchange === ex.name && lf.asset === "USDT" && lf.unlockAt > simulation.currentTime)
                      .reduce((sum, lf) => sum + lf.amount, 0);
                    const lockedBTC = simulation.lockedFunds
                      .filter(lf => lf.exchange === ex.name && lf.asset === "BTC" && lf.unlockAt > simulation.currentTime)
                      .reduce((sum, lf) => sum + lf.amount, 0);
                    const lockedETH = simulation.lockedFunds
                      .filter(lf => lf.exchange === ex.name && lf.asset === "ETH" && lf.unlockAt > simulation.currentTime)
                      .reduce((sum, lf) => sum + lf.amount, 0);
                    
                    const availUSDT = ex.balances.USDT - lockedUSDT;
                    const availBTC = ex.balances.BTC - lockedBTC;
                    const availETH = ex.balances.ETH - lockedETH;
                    
                    return (
                      <div key={ex.name} className="funds-exchange">
                        <div className="funds-exchange-name">{ex.displayName}</div>
                        <div className="funds-assets">
                          <div className="funds-asset">
                            <span className="asset-label">USDT</span>
                            <span className="asset-avail">{availUSDT.toFixed(0)}</span>
                            {lockedUSDT > 0 && <span className="asset-locked">({lockedUSDT.toFixed(0)} locked)</span>}
                          </div>
                          <div className="funds-asset">
                            <span className="asset-label">BTC</span>
                            <span className="asset-avail">{availBTC.toFixed(4)}</span>
                            {lockedBTC > 0 && <span className="asset-locked">({lockedBTC.toFixed(4)} locked)</span>}
                          </div>
                          <div className="funds-asset">
                            <span className="asset-label">ETH</span>
                            <span className="asset-avail">{availETH.toFixed(2)}</span>
                            {lockedETH > 0 && <span className="asset-locked">({lockedETH.toFixed(2)} locked)</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PnL Summary */}
              <div className="pnl-chart">
                <div className="chart-header">
                  <h4>Cumulative P/L</h4>
                  <span className={`pnl-value ${simulation.totalPnL >= 0 ? "positive" : "negative"}`}>
                    ${simulation.totalPnL.toFixed(4)}
                  </span>
                </div>
                <div className="chart-area">
                  {simulation.trades.length === 0 ? (
                    <div className="chart-empty">Start simulation to see P/L chart</div>
                  ) : (
                    <div className="mini-chart">
                      {simulation.trades.slice(-50).map((trade, idx) => {
                        const cumPnL = simulation.trades.slice(0, simulation.trades.indexOf(trade) + 1).reduce((a, b) => a + b.netProfit, 0);
                        const maxPnL = Math.max(...simulation.trades.map((_, i) => simulation.trades.slice(0, i + 1).reduce((a, b) => a + b.netProfit, 0)));
                        const minPnL = Math.min(...simulation.trades.map((_, i) => simulation.trades.slice(0, i + 1).reduce((a, b) => a + b.netProfit, 0)));
                        const range = Math.max(maxPnL - minPnL, 1);
                        const height = ((cumPnL - minPnL) / range) * 100;
                        return (
                          <div 
                            key={idx}
                            className={`chart-bar ${trade.netProfit >= 0 ? "positive" : "negative"}`}
                            style={{ height: `${Math.max(5, height)}%` }}
                            title={`$${cumPnL.toFixed(4)}`}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Trade Feed */}
              <div className="trade-feed">
                <div className="feed-header">
                  <h4>Executed Trades</h4>
                  <span className="trade-count">{simulation.trades.length} trades</span>
                </div>
                <div className="feed-content">
                  {simulation.trades.slice(-20).reverse().map(trade => (
                    <div 
                      key={trade.id} 
                      className={`trade-entry ${trade.status}`}
                      onClick={() => setSelectedTrade(trade)}
                    >
                      <div className="trade-time">
                        {new Date(trade.timestamp).toLocaleTimeString()}
                      </div>
                      <div className="trade-route">
                        <span className="badge">{trade.buyExchange}</span>
                        <span className="arrow">→</span>
                        <span className="badge">{trade.sellExchange}</span>
                      </div>
                      <div className="trade-asset">{trade.asset}</div>
                      <div className="trade-size">
                        <span className="size-amount">{trade.amount.toFixed(6)}</span>
                        <span className="size-value">${(trade.amount * trade.buyPrice).toFixed(0)}</span>
                      </div>
                      <div className={`trade-profit ${trade.netProfit >= 0 ? "positive" : "negative"}`}>
                        ${trade.netProfit.toFixed(4)}
                      </div>
                      <div className={`trade-status ${trade.status}`}>
                        {trade.status === "success" ? "OK" : trade.status === "partial" ? "PT" : "X"}
                      </div>
                    </div>
                  ))}
                  {simulation.trades.length === 0 && (
                    <div className="feed-empty">No trades yet. Start simulation to begin.</div>
                  )}
                </div>
              </div>

              {/* Real-time Logs */}
              <div className="log-panel">
                <div className="log-header">
                  <h4>System Logs</h4>
                  <button className="btn btn-ghost btn-sm" onClick={() => setLogs([])}>Clear</button>
                </div>
                <div className="log-content">
                  {logs.map((log, idx) => (
                    <div key={idx} className={`log-entry ${log.includes("SUCCESS") ? "success" : log.includes("FAILED") || log.includes("TIMEOUT") || log.includes("ERROR") ? "error" : ""}`}>
                      {log}
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>
          )}

          {activeTab === "analytics" && (
            <div className="analytics-panel">
              <div className="analytics-grid">
                <div className="analytics-card">
                  <span className="analytics-value">{dataMode === "backtest" ? backtestConfig.data.length : liveOpportunities.length}</span>
                  <span className="analytics-label">Opportunities</span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-value">{analytics.totalTrades}</span>
                  <span className="analytics-label">Total Trades</span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-value green">{analytics.successfulTrades}</span>
                  <span className="analytics-label">Successful</span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-value red">{analytics.failedTrades}</span>
                  <span className="analytics-label">Failed</span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-value">{analytics.winRate.toFixed(1)}%</span>
                  <span className="analytics-label">Win Rate</span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-value">{analytics.avgExecutionTime.toFixed(0)}ms</span>
                  <span className="analytics-label">Avg Latency</span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-value">{analytics.sharpeRatio.toFixed(2)}</span>
                  <span className="analytics-label">Sharpe Ratio</span>
                </div>
              </div>

              <div className="analytics-breakdown">
                <h4>Cost Breakdown</h4>
                <div className="breakdown-bars">
                  <div className="breakdown-item">
                    <span className="breakdown-label">Trading Fees</span>
                    <div className="breakdown-bar">
                      <div className="breakdown-fill fees" style={{ width: `${Math.min(100, (analytics.totalFees / (Math.abs(simulation.totalPnL) || 1)) * 100)}%` }} />
                    </div>
                    <span className="breakdown-value">${analytics.totalFees.toFixed(4)}</span>
                  </div>
                  <div className="breakdown-item">
                    <span className="breakdown-label">Slippage</span>
                    <div className="breakdown-bar">
                      <div className="breakdown-fill slippage" style={{ width: `${Math.min(100, (analytics.totalSlippage / (Math.abs(simulation.totalPnL) || 1)) * 100)}%` }} />
                    </div>
                    <span className="breakdown-value">${analytics.totalSlippage.toFixed(4)}</span>
                  </div>
                </div>
              </div>

              <div className="analytics-sensitivity">
                <h4>Data Mode Analysis</h4>
                <p className="sensitivity-note">
                  <strong>Current mode: {DATA_MODE_INFO[dataMode].title}</strong><br/>
                  {dataMode === "backtest" && `Replaying ${backtestConfig.data.length} historical opportunities. Progress: ${backtestConfig.currentIndex}/${backtestConfig.data.length}`}
                  {dataMode === "live" && `Real-time paper trading with actual market data. ${liveOpportunities.length} opportunities received.`}
                </p>
              </div>

              {/* Real opportunities from API */}
              {realOpportunities && realOpportunities.length > 0 && (
                <div className="real-opportunities">
                  <h4>Real Market Opportunities (Click for Details)</h4>
                  <div className="real-opp-list">
                    {realOpportunities.slice(0, 5).map(opp => (
                      <div 
                        key={opp.id} 
                        className="real-opp-item"
                        onClick={() => setSelectedOpportunity(opp)}
                      >
                        <span className="opp-asset">{opp.asset}</span>
                        <span className="opp-route">{opp.buy_exchange_name} → {opp.sell_exchange_name}</span>
                        <span className={`opp-spread ${parseFloat(opp.spread_pct) > 0.3 ? "high" : ""}`}>
                          {parseFloat(opp.spread_pct).toFixed(3)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Panel - Controls & Status */}
        <div className="panel control-panel">
          <div className="panel-header">
            <h3>Simulation Control</h3>
          </div>
          
          <div className="active-mode-display">
            <span className="mode-badge" style={{ background: DATA_MODE_INFO[dataMode].color }}>
              {DATA_MODE_INFO[dataMode].title}
            </span>
          </div>

          <div className="control-buttons">
            {!simulation.isRunning ? (
              <button 
                className="btn btn-primary btn-lg full-width" 
                onClick={startSimulation}
                disabled={isLoadingBacktest}
              >
                {isLoadingBacktest ? (
                  <>
                    <div className="spinner small" />
                    Loading Data...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <polygon points="5,3 19,12 5,21"/>
                    </svg>
                    Start {DATA_MODE_INFO[dataMode].title}
                  </>
                )}
              </button>
            ) : (
              <>
                <button className="btn btn-stop btn-lg" onClick={stopSimulation}>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                  </svg>
                  Stop
                </button>
                {dataMode !== "live" && (
                  <button className={`btn ${simulation.isPaused ? "btn-primary" : "btn-secondary"}`} onClick={togglePause}>
                    {simulation.isPaused ? "▶ Resume" : "⏸ Pause"}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="speed-control">
            <span className="speed-label">Playback Speed</span>
            <div className="speed-buttons">
              {[1, 5, 10, 50, 100].map(s => (
                <button 
                  key={s}
                  className={`speed-btn ${simulation.speed === s ? "active" : ""}`}
                  onClick={() => setSpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>
            {dataMode === "live" && (
              <p className="hint" style={{ marginTop: "0.5rem" }}>
                {botConfig.connectionType === "websocket" 
                  ? "SSE mode: Real-time push (speed affects processing only)"
                  : `REST mode: Polling at ${Math.round(pollingInterval / simulation.speed)}ms intervals`
                }
              </p>
            )}
          </div>

          <div className="live-stats">
            <div className="stat-row">
              <span className="stat-label">Total P/L</span>
              <span className={`stat-value ${simulation.totalPnL >= 0 ? "positive" : "negative"}`}>
                ${simulation.totalPnL.toFixed(4)}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Trades</span>
              <span className="stat-value">{simulation.trades.length}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Win Rate</span>
              <span className="stat-value">{analytics.winRate.toFixed(1)}%</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Avg Latency</span>
              <span className="stat-value">{analytics.avgExecutionTime.toFixed(0)}ms</span>
            </div>
          </div>

        </div>
      </div>

      {/* Trade Detail Modal */}
      {selectedTrade && (
        <div className="modal-overlay" onClick={() => setSelectedTrade(null)}>
          <div className="modal-content trade-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Trade Details</h2>
              <button className="modal-close" onClick={() => setSelectedTrade(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Timestamp</span>
                  <span className="detail-value">{new Date(selectedTrade.timestamp).toLocaleString()}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Type</span>
                  <span className="detail-value">{selectedTrade.type}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Asset</span>
                  <span className="detail-value">{selectedTrade.asset}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Status</span>
                  <span className={`detail-value ${selectedTrade.status}`}>{selectedTrade.status}</span>
                </div>
              </div>
              <div className="detail-section">
                <h4>Route</h4>
                <div className="route-detail">
                  <div className="route-side">
                    <span className="side-label">BUY</span>
                    <span className="exchange">{selectedTrade.buyExchange}</span>
                    <span className="price">${selectedTrade.buyPrice.toFixed(2)}</span>
                  </div>
                  <div className="route-arrow">→</div>
                  <div className="route-side">
                    <span className="side-label">SELL</span>
                    <span className="exchange">{selectedTrade.sellExchange}</span>
                    <span className="price">${selectedTrade.sellPrice.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <div className="detail-section">
                <h4>Financials</h4>
                <div className="financial-breakdown">
                  <div className="fin-row">
                    <span>Amount</span>
                    <span>{selectedTrade.amount.toFixed(8)} {selectedTrade.asset}</span>
                  </div>
                  <div className="fin-row">
                    <span>Gross Profit</span>
                    <span className="positive">${selectedTrade.grossProfit.toFixed(6)}</span>
                  </div>
                  <div className="fin-row">
                    <span>Fees</span>
                    <span className="negative">-${selectedTrade.fees.toFixed(6)}</span>
                  </div>
                  <div className="fin-row">
                    <span>Slippage</span>
                    <span className="negative">-${selectedTrade.slippage.toFixed(6)}</span>
                  </div>
                  <div className="fin-row">
                    <span>Latency Cost</span>
                    <span className="negative">-${selectedTrade.latencyCost.toFixed(6)}</span>
                  </div>
                  <div className="fin-row total">
                    <span>Net Profit</span>
                    <span className={selectedTrade.netProfit >= 0 ? "positive" : "negative"}>
                      ${selectedTrade.netProfit.toFixed(6)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="detail-section">
                <h4>Execution</h4>
                <div className="execution-detail">
                  <span>Execution Time: <strong>{selectedTrade.executionTimeMs}ms</strong></span>
                  {selectedTrade.sourceOpportunityId && (
                    <span style={{ marginLeft: "1rem" }}>Source ID: <strong>#{selectedTrade.sourceOpportunityId}</strong></span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Real Opportunity Detail Modal */}
      {selectedOpportunity && (
        <TradeDetailModal
          opportunity={selectedOpportunity}
          onClose={() => setSelectedOpportunity(null)}
        />
      )}
    </div>
  );
}
