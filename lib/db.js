/**
 * Copyright ©2017. The Regents of the University of California (Regents). All Rights Reserved.
 *
 * Permission to use, copy, modify, and distribute this software and its documentation
 * for educational, research, and not-for-profit purposes, without fee and without a
 * signed licensing agreement, is hereby granted, provided that the above copyright
 * notice, this paragraph and the following two paragraphs appear in all copies,
 * modifications, and distributions.
 *
 * Contact The Office of Technology Licensing, UC Berkeley, 2150 Shattuck Avenue,
 * Suite 510, Berkeley, CA 94720-1620, (510) 643-7201, otl@berkeley.edu,
 * http://ipira.berkeley.edu/industry-info for commercial licensing opportunities.
 *
 * IN NO EVENT SHALL REGENTS BE LIABLE TO ANY PARTY FOR DIRECT, INDIRECT, SPECIAL,
 * INCIDENTAL, OR CONSEQUENTIAL DAMAGES, INCLUDING LOST PROFITS, ARISING OUT OF
 * THE USE OF THIS SOFTWARE AND ITS DOCUMENTATION, EVEN IF REGENTS HAS BEEN ADVISED
 * OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * REGENTS SPECIFICALLY DISCLAIMS ANY WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE
 * SOFTWARE AND ACCOMPANYING DOCUMENTATION, IF ANY, PROVIDED HEREUNDER IS PROVIDED
 * "AS IS". REGENTS HAS NO OBLIGATION TO PROVIDE MAINTENANCE, SUPPORT, UPDATES,
 * ENHANCEMENTS, OR MODIFICATIONS.
 */

var _ = require('lodash');
var config = require('config');
var Sequelize = require('sequelize');

// A sequelize instance that will be connected to the database
var sequelize = null;

/**
 * Initialize the database and the Learning Record Store models
 *
 * @param  {Function}       callback            Standard callback function
 * @param  {Object}         callback.err        An error object, if any
 */
var init = module.exports.init = function(callback) {
  var sequelizeConfig = {
    'host': config.get('db.host'),
    'port': config.get('db.port'),
    'dialect': 'postgres',
    'databaseVersion': config.get('db.version'),
  };

  // Set up a connection to the database
  sequelize = new Sequelize(config.get('db.database'), config.get('db.username'), config.get('db.password'), sequelizeConfig);

  sequelize.authenticate().complete(function(err) {
    if (err) {
      console.log({'err': err}, 'Unable to set up a connection to the database');
      return callback({'code': 500, 'msg': 'Unable to set up a connection to the database'});
    }

    console.log('Connected to the database');

    // Set up the model
    setUpModel(sequelize);

    // Synchronize the Learning Record Store models with the database
    return sync(callback);
  });
};

/**
 * Synchronize the Learning Record Store models with the database
 *
 * @param  {Function}       callback            Standard callback function
 * @param  {Object}         callback.err        An error object, if any
 */
var sync = function(callback) {
  // Allow model synchronization to be skipped. This is useful in production so a user without
  // table modification rights can be configured
  if (config.get('db.sync') === false) {
    console.log('Skipping DB synchronization');
    return callback();
  }

  // By setting `force` to `true` we will drop each table and recreate it. This is useful
  // during development/testing when models tend to change. This is NEVER done in production
  var force = false;
  if (process.env.NODE_ENV !== 'production' && config.get('db.dropOnStartup') === true) {
    force = true;
  }

  sequelize.sync({'force': force}).complete(function(err) {
    if (err) {
      console.log({'err': err}, 'Unable to sync the model to the database');
      return callback({'code': 500, 'msg': 'Unable to sync the model to the database'});
    }

    console.log('Synced model to database');
    return callback();
  });
};

/**
 * Get the `Sequelize` object
 *
 * @return {Sequelize}                                A sequelize instance that is connected to the database
 */
var getSequelize = module.exports.getSequelize = function() {
  return sequelize;
};

/**
 * Set up the DB model
 *
 * @param  {Sequelize}        sequelize               A sequelize instance that is connected to the database
 * @api private
 */
var setUpModel = function(sequelize) {

  /**
   * The `tenant` table keeps track of the different tenants in the Learning Record Store
   *
   * @property  {String}      name                          The name of the tenant
   * @property  {String}      privacydashboard_lti_key      The basic LTI key that can be used to embed the privacy dashboard
   * @property  {String}      privacydashboard_lti_secret   The basic LTI secret that can be used to embed the privacy dashboard
   */
  var Tenant = module.exports.Tenant = sequelize.define('tenant', {
    'name': {
      'type': Sequelize.STRING,
      'allowNull': false
    },
    'privacydashboard_lti_key': {
      'type': Sequelize.STRING,
      'allowNull': false,
      'unique': true
    },
    'privacydashboard_lti_secret': {
      'type': Sequelize.STRING,
      'allowNull': false,
      'unique': true
    }
  }, {
    'underscored': true,
    'instanceMethods': {
      'toJSON': function() {
        var tenant = _.clone(this.dataValues);

        // Delete the sensitive values
        delete canvas.privacydashboard_lti_key;
        delete canvas.privacydashboard_lti_secret;

        return tenant;
      }
    }
  });

  /**
   * The `user` table keeps track of each user for which a learning activity has been received.
   *
   * @property  {String}      external_id             The unique external id of the user within the tenant
   * @property  {String}      [email]                 The email of the user
   */
  var User = module.exports.User = sequelize.define('user', {
    'name': {
      'type': Sequelize.STRING,
      'allowNull': true
    },
    'external_id': {
      'type': Sequelize.STRING,
      'allowNull': false
    }
  }, {
    'underscored': true
  });

  // Each user belongs to a tenant
  User.belongsTo(Tenant, {
    'onDelete': 'CASCADE',
    'foreignKey': {
      'name': 'tenant_id',
      'allowNull': false
    }
  });

  /**
   * The `write_credential` table keeps track of all external applications that are allowed to
   * post learning activities to the Learning Record Store and their credentials
   *
   * @property  {String}      name                    The name of the external application
   * @property  {String}      key                     The key used for authentication when posting a learning activity
   * @property  {String}      secret                  The secret used for authentication when posting a learning activity
   */
  var WriteCredential = module.exports.WriteCredential = sequelize.define('write_credential', {
    'name': {
      'type': Sequelize.STRING,
      'allowNull': false
    },
    'key': {
      'type': Sequelize.STRING,
      'allowNull': false
    },
    'secret': {
      'type': Sequelize.STRING,
      'allowNull': false
    }
  }, {
    'underscored': true
  });

  // Every write credential belongs to a tenant
  WriteCredential.belongsTo(Tenant, {
    'onDelete': 'CASCADE',
    'foreignKey': {
      'name': 'tenant_id',
      'allowNull': false
    }
  });

  /**
   * The `read_credential` table keeps track of all projects that are allowed to
   * query the Learning Record Store and their credentials
   *
   * @property  {String}      name                    The name of the project
   * @property  {String}      [description]           The description of the project
   * @property  {Boolean}     anonymous               Whether the project only has access to anonymized learning activities
   * @property  {String}      key                     The key used for authentication when querying the Learning Record Store
   * @property  {String}      secret                  The secret used for authentication when querying the Learning Record Store
   */
  var ReadCredential = module.exports.ReadCredential = sequelize.define('read_credential', {
    'name': {
      'type': Sequelize.STRING,
      'allowNull': false
    },
    'description': {
      'type': Sequelize.TEXT,
      'allowNull': true
    },
    'anonymous': {
      'type': Sequelize.BOOLEAN,
      'defaultValue': false,
      'allowNull': false
    },
    'key': {
      'type': Sequelize.STRING,
      'allowNull': false
    },
    'secret': {
      'type': Sequelize.STRING,
      'allowNull': false
    }
  }, {
    'underscored': true
  });

  // A read credential can be limited to a single tenant. `null`
  // will be used if the read credentials allows reading from all
  // tenants
  ReadCredential.belongsTo(Tenant, {
    'onDelete': 'CASCADE',
    'foreignKey': {
      'name': 'tenant_id',
      'allowNull': true
    }
  });

  // A user can opt out of multiple read credentials and a read credential
  // can be opted out of by multiple users
  ReadCredential.belongsToMany(User, {'through': 'opt_out'});
  User.belongsToMany(ReadCredential, {'through': 'opt_out'});

  /**
   * The `statement` table keeps track of all learning activities
   *
   * @property  {String}      uuid                    The unique UUID of the learning activity statement
   * @property  {Object}      statement               The raw learning activity statement object
   * @property  {String}      verb                    The verb of the learning activity
   * @property  {Date}        timestamp               The time at which the learning activity took place
   * @property  {String}      activity_type           An aggregated learning activity type containing the verb and object type (e.g., read_page)
   * @property  {Boolean}     voided                  Whether the learning activity statement has been voided
   */
  var Statement = module.exports.Statement = sequelize.define('statement', {
    'uuid': {
      'type': Sequelize.STRING,
      'allowNull': false,
      'primaryKey': true
    },
    'statement': {
      'type': Sequelize.JSON,
      'allowNull': false
    },
    'verb': {
      'type': Sequelize.STRING,
      'allowNull': false
    },
    'timestamp': {
      'type': Sequelize.DATE,
      'allowNull': false
    },
    'activity_type': {
      'type': Sequelize.STRING,
      'allowNull': false
    },
    'actor_type': {
      'type': Sequelize.STRING,
      'allowNull': false
    },
    'statement_type': {
      'type': Sequelize.STRING,
      'allowNull': false
    },
    'voided': {
      'type': Sequelize.BOOLEAN,
      'defaultValue': false,
      'allowNull': false
    }
  }, {
    'underscored': true
  });

  // Every statement will be associated to a tenant
  Statement.belongsTo(Tenant, {
    'onDelete': 'CASCADE',
    'foreignKey': {
      'name': 'tenant_id',
      'allowNull': false
    }
  });

  // Every statement will be associated to a user
  Statement.belongsTo(User, {
    'onDelete': 'CASCADE',
    'foreignKey': {
      'name': 'user_id',
      'allowNull': false
    }
  });

  // A statement will be stored by a write credential
  Statement.belongsTo(WriteCredential, {
    'onDelete': 'CASCADE',
    'foreignKey': {
      'name': 'write_credential_id',
      'allowNull': false
    }
  });
};
