import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { SignalStack } from '../lib/signal-stack';

const synthesize = () => {
  const app = new cdk.App();
  const stack = new SignalStack(app, 'TestStack');
  return Template.fromStack(stack);
};

test('serves a health endpoint over a public function URL', () => {
  const template = synthesize();

  template.resourceCountIs('AWS::Lambda::Function', 1);
  template.hasResourceProperties('AWS::Lambda::Url', {
    AuthType: 'NONE',
  });
});

test('grants anonymous callers both permissions required since October 2025', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::Lambda::Permission', {
    Action: 'lambda:InvokeFunctionUrl',
    Principal: '*',
    FunctionUrlAuthType: 'NONE',
  });
  template.hasResourceProperties('AWS::Lambda::Permission', {
    Action: 'lambda:InvokeFunction',
    Principal: '*',
    InvokedViaFunctionUrl: true,
  });
});

test('exposes the URL as a stack output', () => {
  const template = synthesize();

  const outputs = template.findOutputs('SignalUrl');
  expect(Object.keys(outputs)).toHaveLength(1);
});
