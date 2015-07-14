var React = require('react');
var Lectures = require('./Lectures.react.js');

module.exports = CollaboreadApp = React.createClass({
    render: function() {
        return (
            <div className="collaboread-app">
                <Lectures lectures={this.state.lectures} />
            </div>
        )
    },

    getInitialState: function(props) {
        props = props || this.props;

        return {
            lectures: props.lectures
        };
    }
});
