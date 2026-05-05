const escapeCsvValue = (value) => {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
};

const buildCsv = (headers, rows) => {
  const csvRows = rows.map(row => row.map(escapeCsvValue).join(','));
  return [headers.join(','), ...csvRows].join('\n');
};

const getReportDateStamp = () => new Date().toISOString().slice(0, 10);

const sendReportCsv = (res, reportName, headers, rows) => {
  const csvContent = buildCsv(headers, rows);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${reportName}_report_${getReportDateStamp()}.csv"`
  );

  return res.send(csvContent);
};

module.exports = {
  sendReportCsv
};
