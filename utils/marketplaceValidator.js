/**
 * Utilitário para validação de pedidos de marketplace
 */

/**
 * Verifica se um pedido é de marketplace baseado no orderId
 * @param {string} orderId - ID do pedido
 * @returns {boolean} true se for pedido de marketplace, false caso contrário
 */
function isMarketplaceOrder(orderId) {
  if (!orderId || typeof orderId !== 'string') {
    return false;
  }

  // Padrões de marketplace conhecidos
  const isMarketplacePattern = /^[a-zA-Z]|^marketplace|^MP|^shopee|^mercadolivre|^amazon|^PRV/i;
  
  // Verifica se tem números (pedidos normais têm números)
  const hasNumbers = /\d/.test(orderId);
  
  // É marketplace se bate com o padrão OU não tem números
  const isMarketplace = isMarketplacePattern.test(orderId) || !hasNumbers;
  
  return isMarketplace;
}

/**
 * Filtra array de pedidos removendo pedidos de marketplace
 * @param {Array} orders - Array de pedidos
 * @param {string} orderIdField - Nome do campo que contém o orderId (padrão: 'orderId')
 * @returns {Object} { filtered: Array, skipped: number, skippedOrders: Array }
 */
function filterMarketplaceOrders(orders, orderIdField = 'orderId') {
  const filtered = [];
  const skippedOrders = [];
  
  for (const order of orders) {
    const orderId = order[orderIdField] || order.order || order.id;
    
    if (isMarketplaceOrder(orderId)) {
      skippedOrders.push(orderId);
    } else {
      filtered.push(order);
    }
  }
  
  return {
    filtered,
    skipped: skippedOrders.length,
    skippedOrders
  };
}

module.exports = {
  isMarketplaceOrder,
  filterMarketplaceOrders
};
