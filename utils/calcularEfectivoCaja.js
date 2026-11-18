import currency from 'currency.js';

export function calcularEfectivoEsperado({
    montoInicial,
    totalEntradas,
    totalSalidas,
}) {
    return currency(Number(montoInicial ?? 0))
        .add(Number(totalEntradas ?? 0))
        .subtract(Number(totalSalidas ?? 0))
        .value;
}
