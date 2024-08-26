import React from 'react';

function InfoCard({ title, value }) {
  return (
    <div className="bg-white p-4 rounded shadow">
      <h4 className="font-semibold">{title}</h4>
      <p className="text-2xl">{value}</p>
    </div>
  );
}

export default InfoCard;
