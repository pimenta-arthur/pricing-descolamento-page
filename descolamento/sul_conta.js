// Conta do descolamento do Sul no navegador: porta de `sul.prever` (A), `sul.prever_sul` (B), `sul.prever_C` (C),
// `sul.estresse_venda`, `sul.estresse_compra`, `sul.estresse_compra_avancado` e `sul.cotar_sul` (D069–D073).
// Teste de paridade Python × JS em tests/test_sul_pagina.py. Página local de teste, separada das páginas do NE e N.
(function (raiz) {
  "use strict";

  const DIAS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function anoDe(mes) { return +mes.slice(0, 4); }
  function mesDe(mes) { return +mes.slice(5, 7); }
  function bissexto(a) { return (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0; }
  function horas(mes) { const m = mesDe(mes); return 24 * (m === 2 && bissexto(anoDe(mes)) ? 29 : DIAS[m - 1]); }
  function distMes(m1, m2) { return Math.abs((((m1 - m2) + 6) % 12 + 12) % 12 - 6); }
  function quantil(valores, q) {  // numpy, interpolação linear
    const v = valores.slice().sort((a, b) => a - b); const n = v.length;
    if (!n) return NaN;
    const pos = (n - 1) * q, lo = Math.floor(pos), hi = Math.min(lo + 1, n - 1);
    return v[lo] + (v[hi] - v[lo]) * (pos - lo);
  }
  function media(v) { return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; }
  function pesos(meses) { const h = meses.map(horas); const t = h.reduce((s, x) => s + x, 0); return h.map((x) => x / t); }

  // ---------------------------------------------------------------- A: climatologia condicional ao SE
  function A_mes(D, mes, se) {
    const cal = mesDe(mes);
    const anos = D.historico.filter((r) => r.elegivel && mesDe(r.mes) === cal).map((r) => {
      const pat = r.patamar == null ? se : r.patamar;
      return { ano: anoDe(r.mes), mes: r.mes, frac: r.frac_h, patamar: r.patamar, valor: r.frac_h * Math.max(pat - se, 0), clim_rs: Math.max(r.d_S, 0) };
    });
    return anos;
  }

  // ---------------------------------------------------------------- B: estrutural (chance de travar por caixa de hora × ganho)
  function B_mes(D, mes, se) {
    const cen = D.B.cenarios[mes] || {}; const pat = D.B.patamar.patamar; const perf = D.B.perfil_se;
    return Object.keys(cen).sort().map((ano) => {
      const c = cen[ano]; let v = 0, fr = 0, ganhoP = 0;
      for (const [rot, rel] of [["du", perf.du], ["fds", perf.fds]]) {
        const p = c["p_" + rot], w = c["w_" + rot];
        for (let h = 0; h < 24; h++) { const g = Math.max(pat - se * rel[h], 0); v += w[h] * p[h] * g; fr += w[h] * p[h]; ganhoP += w[h] * p[h] * g; }
      }
      return { ano: +ano, valor: v, frac: fr, ganho_medio: fr > 0 ? ganhoP / fr : 0, hidro: c.hidro, carga: c.carga, renovavel: c.renovavel, limite: c.limite, margem_q50: c.margem_q50 };
    });
  }

  // ---------------------------------------------------------------- C: fração por estado (núcleo em EARM) × patamar pela reta
  function C_ganho(D, se) { const r = D.C.reta; const pat = r.forma === "linear" ? r.a + r.b * se : r.b * se; return { patamar: pat, ganho: Math.max(pat - se * D.C.fator, 0) }; }
  function C_fracoes(D, mes) {
    const cand = D.C.candidatos[mes] || []; const earm = D.C.earm_series[mes]; const k = D.C.kernel;
    if (!earm) return null;
    if (!cand.length) return earm.map(() => 0);
    return earm.map((e) => {
      let sw = 0, sf = 0;
      for (const c of cand) { const w = Math.exp(-0.5 * Math.pow((e - c.earm) / k, 2)) + 1e-12; sw += w; sf += w * c.frac; }
      return sf / sw;
    });
  }
  function C_mes(D, mes, se) {
    const g = C_ganho(D, se); const fr = C_fracoes(D, mes);
    if (!fr) return null;
    const valores = fr.map((f) => f * g.ganho);
    return { valores, fracoes: fr, patamar: g.patamar, ganho: g.ganho, fator: D.C.fator, candidatos: D.C.candidatos[mes] || [], earm: D.C.earm_series[mes] };
  }

  // ---------------------------------------------------------------- estresses (venda e compra)
  function estresseVenda(D, mes, se) {
    const cal = mesDe(mes); const el = D.historico.filter((r) => r.elegivel);
    const viz = el.filter((r) => distMes(mesDe(r.mes), cal) <= 1);
    const sem = el.filter((r) => (cal <= 6 ? mesDe(r.mes) <= 6 : mesDe(r.mes) > 6));
    const ganhoDe = (r) => Math.max(r.patamar - se * (r.fator == null ? 1 : r.fator), 0);
    const anc = viz.filter((r) => r.frac_h > 0 && r.patamar != null).map((r) => ({ mes: r.mes, valor: r.frac_h * ganhoDe(r), frac: r.frac_h, patamar: r.patamar, fator: r.fator }));
    const ancMes = anc.filter((r) => mesDe(r.mes) === cal);
    const gs = sem.filter((r) => r.frac_h > 0.03 && r.patamar != null).map((r) => ({ mes: r.mes, valor: ganhoDe(r), patamar: r.patamar, fator: r.fator }));
    const max = (xs) => xs.reduce((m, r) => (r.valor > m.valor ? r : m), { valor: 0, mes: null });
    const aV = max(anc), aM = max(ancMes), gM = max(gs);
    const fracMax = viz.reduce((m, r) => (r.frac_h > m.frac_h ? r : m), { frac_h: 0, mes: null });
    return { ancora_viz: aV.valor, mes_ancora_viz: aV.mes, ancora_mes: aM.valor, mes_ancora: aM.mes, detalhe_ancora: ancMes, frac_max_viz: fracMax.frac_h, mes_frac_max: fracMax.mes, ganho_max_sem: gM.valor, mes_ganho_max: gM.mes, estresse_sem: fracMax.frac_h * gM.valor };
  }
  function pisoAno(D, mes) { const a = anoDe(mes); const chaves = Object.keys(D.piso).map(Number).sort((x, y) => x - y); const k = a <= chaves[chaves.length - 1] ? a : chaves[chaves.length - 1]; return D.piso[String(k)]; }
  function estresseCompra(D, mes, se) {
    const cal = mesDe(mes); const piso = pisoAno(D, mes);
    const viz = D.historico.filter((r) => r.frac_folga_baixo != null && distMes(mesDe(r.mes), cal) <= 1);
    if (!viz.length) return { valor: 0, mes: null, frac_folga: 0 };
    const pior = viz.reduce((m, r) => (r.frac_folga_baixo < m.frac_folga_baixo ? r : m));
    return { valor: pior.frac_folga_baixo * Math.max(se - piso, 0), mes: pior.mes, frac_folga: pior.frac_folga_baixo };
  }
  function estresseCompraAvancado(D, mes, se, ref) {
    const piso = pisoAno(D, mes);
    if (ref === "historico") {
      const xs = D.historico.filter((r) => r.frac_folga_baixo != null);
      if (!xs.length) return { valor: 0, mes: null };
      const pior = xs.reduce((m, r) => (r.frac_folga_baixo < m.frac_folga_baixo ? r : m));
      return { valor: pior.frac_folga_baixo * Math.max(se - piso, 0), mes: pior.mes, frac_folga: pior.frac_folga_baixo };
    }
    const xs = D.historico.filter((r) => r.frac_h_baixo != null && r.frac_h_baixo > 0);
    if (!xs.length) return { valor: 0, mes: null };
    const pior = xs.reduce((m, r) => (r.frac_h_baixo > m.frac_h_baixo ? r : m));
    return { valor: -pior.frac_h_baixo * Math.max(se * (pior.fator_baixo == null ? 1 : pior.fator_baixo) - piso, 0), mes: pior.mes, frac_h: pior.frac_h_baixo, fator: pior.fator_baixo };
  }

  // ---------------------------------------------------------------- cotação por mês e por produto
  const PADRAO = { lam: 0.25, regra: "ancora_mes", estresse_ref: "estresse_sem", compra: "zero", lam_compra: 0.0, estresse_compra_ref: "fisico" };

  function produtosDe(meses) {
    const out = {}; const anos = [...new Set(meses.map(anoDe))].sort();
    for (const a of anos) {
      const ms = meses.filter((m) => anoDe(m) === a);
      if (ms.length === 12) out["A-" + a] = ms;
      const s1 = ms.filter((m) => mesDe(m) <= 6), s2 = ms.filter((m) => mesDe(m) > 6);
      if (s1.length === 6) out["S1/" + String(a).slice(2)] = s1;
      if (s2.length === 6) out["S2/" + String(a).slice(2)] = s2;
      for (let t = 0; t < 4; t++) { const mt = ms.filter((m) => Math.floor((mesDe(m) - 1) / 3) === t); if (mt.length === 3) out["T" + (t + 1) + "/" + String(a).slice(2)] = mt; }
    }
    return out;
  }

  // cotação de um conjunto de meses (um mês = produto de um mês), com os detalhes de cálculo
  function cotarProduto(D, ms, seMensal, P) {
    const w = pesos(ms);
    // C: série a série
    const Cm = ms.map((m) => C_mes(D, m, seMensal[m]));
    let C = null;
    if (Cm.every((x) => x)) {
      const n = Cm[0].valores.length; const v = new Array(n).fill(0);
      Cm.forEach((x, i) => { for (let s = 0; s < n; s++) v[s] += w[i] * x.valores[s]; });
      C = { justo: media(v), P10: quantil(v, 0.1), P90: quantil(v, 0.9), min: Math.min(...v), max: Math.max(...v), frac_media: media(Cm.map((x) => media(x.fracoes))), meses: Cm };
    }
    // A: ano a ano (mês não elegível para o ano = 0)
    const Am = ms.map((m) => A_mes(D, m, seMensal[m]));
    const anosA = [...new Set(Am.flat().map((r) => r.ano))].sort();
    const A_anos = anosA.map((ano) => ({ ano, valor: Am.reduce((s, lst, i) => { const r = lst.find((x) => x.ano === ano); return s + w[i] * (r ? r.valor : 0); }, 0), meses: Am.map((lst) => lst.find((x) => x.ano === ano) || null) }));
    const vA = A_anos.map((r) => r.valor);
    const A = { anos: A_anos, compra: vA.length ? Math.min(...vA) : 0, justo: vA.length ? media(vA) : 0, venda: vA.length ? Math.max(...vA) : 0, ano_venda: vA.length ? A_anos[vA.indexOf(Math.max(...vA))].ano : null };
    // B: anos climáticos presentes em todos os meses
    const Bm = ms.map((m) => B_mes(D, m, seMensal[m]));
    const anosB = Bm.length ? Bm[0].map((r) => r.ano).filter((a) => Bm.every((lst) => lst.some((r) => r.ano === a))) : [];
    const B_anos = anosB.map((ano) => ({ ano, valor: Bm.reduce((s, lst, i) => s + w[i] * lst.find((r) => r.ano === ano).valor, 0), frac: Bm.reduce((s, lst, i) => s + w[i] * lst.find((r) => r.ano === ano).frac, 0), meses: Bm.map((lst) => lst.find((r) => r.ano === ano)) }));
    const vB = B_anos.map((r) => r.valor);
    const B = { anos: B_anos, compra: vB.length ? Math.min(...vB) : 0, justo: vB.length ? media(vB) : 0, venda: vB.length ? Math.max(...vB) : 0, ano_venda: vB.length ? B_anos[vB.indexOf(Math.max(...vB))].ano : null, frac_media: vB.length ? media(B_anos.map((r) => r.frac)) : 0 };
    // venda e compra (D071–D073)
    const Em = ms.map((m) => estresseVenda(D, m, seMensal[m]));
    const agg = (f) => Em.reduce((s, e, i) => s + w[i] * f(e), 0);
    const ancora = agg((e) => e[P.regra]), estresse = agg((e) => e[P.estresse_ref]);
    const Cb = ms.map((m) => estresseCompra(D, m, seMensal[m]));
    const eb = Cb.reduce((s, x, i) => s + w[i] * x.valor, 0);
    const Cav = ms.map((m) => (P.lam_compra ? estresseCompraAvancado(D, m, seMensal[m], P.estresse_compra_ref) : { valor: 0 }));
    const ebAv = Cav.reduce((s, x, i) => s + w[i] * x.valor, 0);
    const p90 = C ? C.P90 : 0, p10 = C ? C.P10 : 0;
    const pisoV = Math.max(p90, ancora);
    const pisoC = (P.compra === "P10" ? p10 : 0) + eb;
    return {
      meses: ms, se: ms.map((m) => seMensal[m]),
      justo: C ? C.justo : NaN, P10: p10, P90: p90, ancora, estresse,
      venda: pisoV + P.lam * Math.max(estresse - pisoV, 0), piso_venda: pisoV,
      estresse_baixo: eb, estresse_compra_av: ebAv, piso_compra: pisoC, compra: pisoC + P.lam_compra * Math.min(ebAv - pisoC, 0),
      A, B, C, venda_det: Em, compra_det: Cb, compra_av_det: Cav,
    };
  }

  function cotar(D, seMensal, params) {
    const P = Object.assign({}, PADRAO, params || {});
    const meses = D.meses.filter((m) => seMensal[m] != null);
    const out = { parametros: P, mes: {}, produtos: {} };
    for (const m of meses) out.mes[m] = cotarProduto(D, [m], seMensal, P);
    const prods = produtosDe(meses);
    for (const k of Object.keys(prods)) out.produtos[k] = cotarProduto(D, prods[k], seMensal, P);
    return out;
  }

  raiz.SulConta = { horas, quantil, A_mes, B_mes, C_mes, C_ganho, estresseVenda, estresseCompra, estresseCompraAvancado, cotarProduto, cotar, produtosDe, PADRAO };
})(typeof window !== "undefined" ? window : (typeof module !== "undefined" ? module.exports : this));
