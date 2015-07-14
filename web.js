var React = require('react');
var CollaboreadApp = require('/app/components/CollaboreadApp.react');

var initialState = JSON.parse(document.getElementById('initial-state').innerHTML);

React.renderComponent(
    <CollaboreadApp data={initialState}/>,
    document.getElementById('react-app')
);
